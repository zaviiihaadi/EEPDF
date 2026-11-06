"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, KeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from "pdfjs-dist";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  FileText,
  ArrowRight,
  Circle,
  Eraser,
  Highlighter,
  Image as ImageIcon,
  Maximize,
  MessageSquarePlus,
  Minus,
  MousePointer2,
  PanelLeft,
  PanelRight,
  Pencil,
  PenLine,
  Plus,
  Printer,
  Shapes,
  Square,
  RotateCw,
  Search,
  Type,
  TextCursorInput,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import Button from "@/components/arc/button/button";
import ExpandingButtonGroup from "@/components/arc/expanding-button-group/expanding-button-group";
import type { ExpandingButtonGroupItem } from "@/components/arc/expanding-button-group/expanding-button-group";
import styles from "./workspace.module.css";

type DocumentMetadata = {
  id: string;
  filename: string;
  size: number;
  uploadedAt: string;
};

type OcrStatus = {
  status: "not_started" | "processing" | "completed" | "failed";
  startedAt?: string;
  completedAt?: string;
  totalPages?: number;
  completedPages?: number;
  failedPages?: number;
  warning?: string;
  error?: string;
};

type PdfRect = { x: number; y: number; width: number; height: number };

type PdfTextRun = {
  key: string;
  pageNumber: number;
  fontName: string;
  text: string;
  left: number;
  top: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
  fontWeight: number;
  fontItalic: boolean;
  rotation: number;
  rect: PdfRect;
  manual?: boolean;
};

type PdfTextEdit = PdfTextRun & { value: string };
type BlankPageSize = { width: number; height: number };
type WorkspaceTool = "select" | "editText" | "editImage" | "addText" | "signature" | "highlight" | "comment" | "shape" | "redact";
type ShapeKind = "rectangle" | "circle" | "line" | "arrow";
type PdfMarkup = {
  id: string;
  pageNumber: number;
  kind: "image" | "text" | "signature" | "highlight" | "comment" | "shape" | "redact" | "erase";
  rect?: PdfRect;
  text?: string;
  dataUrl?: string;
  shape?: ShapeKind;
  points?: Array<{ x: number; y: number }>;
};
type PdfTransform = [number, number, number, number, number, number];

type PdfJsFontObject = {
  data?: Uint8Array | null;
  bold?: boolean;
  italic?: boolean;
  name?: string;
  cssFontInfo?: { fontFamily?: string; fontWeight?: number; italicAngle?: number };
};

function resolveFontFamily(pdfFont: PdfJsFontObject | undefined, fallback: string | undefined) {
  const source = pdfFont?.cssFontInfo?.fontFamily || pdfFont?.name || fallback || "";
  const normalized = source.toLocaleLowerCase();
  if (/courier|mono|typewriter/.test(normalized)) return '"Courier New", Courier, monospace';
  if (/times|palatino|serif/.test(normalized)) return '"Times New Roman", Times, serif';
  if (/arial|helvetica|sans/.test(normalized)) return 'Arial, Helvetica, sans-serif';
  return source || "Arial, Helvetica, sans-serif";
}

function getPdfJsFont(page: PDFPageProxy, fontName: string): Promise<PdfJsFontObject | undefined> {
  const pool = fontName.startsWith("g_") ? page.commonObjs : page.objs;
  return new Promise((resolve) => {
    try {
      if (pool.has(fontName)) { resolve(pool.get(fontName) as PdfJsFontObject); return; }
      let settled = false;
      const timeout = window.setTimeout(() => { settled = true; resolve(undefined); }, 1500);
      pool.get(fontName, (font: unknown) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        resolve(font as PdfJsFontObject);
      }, () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        resolve(undefined);
      });
    } catch {
      resolve(undefined);
    }
  });
}

function formatSize(size: number) {
  return size >= 1024 * 1024
    ? `${(size / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(size / 1024))} KB`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function PdfThumbnail({
  document,
  pageNumber,
  active,
  onSelect,
}: {
  document: PDFDocumentProxy;
  pageNumber: number;
  active: boolean;
  onSelect: (pageNumber: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let canceled = false;
    let renderTask: RenderTask | undefined;
    const draw = async () => {
      try {
        const page = await document.getPage(pageNumber);
        if (canceled || !canvasRef.current) return;
        const viewport = page.getViewport({ scale: 0.19 });
        const canvas = canvasRef.current;
        const context = canvas.getContext("2d");
        if (!context) return;
        canvas.width = Math.ceil(viewport.width);
        canvas.height = Math.ceil(viewport.height);
        renderTask = page.render({ canvas, canvasContext: context, viewport });
        await renderTask.promise;
      } catch {
        // The main document view still works if a thumbnail cannot render.
      }
    };
    void draw();
    return () => {
      canceled = true;
      renderTask?.cancel();
    };
  }, [document, pageNumber]);

  return (
    <button
      type="button"
      className={`${styles.thumbnailButton} ${active ? styles.thumbnailActive : ""}`}
      aria-current={active ? "page" : undefined}
      aria-label={`Go to page ${pageNumber}`}
      onClick={() => onSelect(pageNumber)}
    >
      <span className={styles.thumbnailPaper}>
        <canvas ref={canvasRef} />
      </span>
      <span className={styles.thumbnailNumber}>{pageNumber}</span>
    </button>
  );
}

function BlankPageThumbnail({
  pageNumber,
  active,
  onSelect,
}: {
  pageNumber: number;
  active: boolean;
  onSelect: (pageNumber: number) => void;
}) {
  return (
    <button
      type="button"
      className={`${styles.thumbnailButton} ${active ? styles.thumbnailActive : ""}`}
      aria-current={active ? "page" : undefined}
      aria-label={`Go to blank page ${pageNumber}`}
      onClick={() => onSelect(pageNumber)}
    >
      <span className={`${styles.thumbnailPaper} ${styles.blankThumbnailPaper}`}>
        <span className={styles.blankThumbnailMark}><Plus size={13} aria-hidden="true" /><span>Blank page</span></span>
      </span>
      <span className={styles.thumbnailNumber}>{pageNumber}</span>
    </button>
  );
}

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const lower = text.toLocaleLowerCase();
  const needle = query.trim().toLocaleLowerCase();
  const result: ReactNode[] = [];
  let cursor = 0;
  let index = lower.indexOf(needle);
  while (index !== -1) {
    if (index > cursor) result.push(text.slice(cursor, index));
    result.push(<mark key={`${index}-${result.length}`}>{text.slice(index, index + needle.length)}</mark>);
    cursor = index + needle.length;
    index = lower.indexOf(needle, cursor);
  }
  result.push(text.slice(cursor));
  return <>{result}</>;
}

export default function Workspace({ documentId }: { documentId: string }) {
  const router = useRouter();
  const [metadata, setMetadata] = useState<DocumentMetadata | null>(null);
  const [ocrStatus, setOcrStatus] = useState<OcrStatus>({ status: "not_started" });
  const [viewSelection, setViewSelection] = useState<{ documentId: string; mode: "original" | "clean" }>({ documentId, mode: "original" });
  const viewMode = viewSelection.documentId === documentId ? viewSelection.mode : "original";
  const setViewMode = useCallback((mode: "original" | "clean") => setViewSelection({ documentId, mode }), [documentId]);
  const [pdfDocument, setPdfDocument] = useState<PDFDocumentProxy | null>(null);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageCount, setPageCount] = useState(0);
  const [pageAddition, setPageAddition] = useState<{ documentId: string; pages: BlankPageSize[] }>({ documentId, pages: [] });
  const addedBlankPages = pageAddition.documentId === documentId ? pageAddition.pages : [];
  const totalPageCount = pageCount + addedBlankPages.length;
  const [zoom, setZoom] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [fitToPage, setFitToPage] = useState(true);
  const [shownThumbnails, setShownThumbnails] = useState(12);
  const [pageText, setPageText] = useState("");
  const [textRuns, setTextRuns] = useState<PdfTextRun[]>([]);
  const [renderScale, setRenderScale] = useState(1);
  const [renderSize, setRenderSize] = useState({ width: 0, height: 0 });
  const [editMode, setEditMode] = useState(false);
  const [edits, setEdits] = useState<Record<string, PdfTextEdit>>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draftRun, setDraftRun] = useState<PdfTextRun | null>(null);
  const [draftText, setDraftText] = useState("");
  const [editNotice, setEditNotice] = useState("");
  const [selectionPreview, setSelectionPreview] = useState<{ left: number; top: number; width: number; height: number } | null>(null);
  const [activeTool, setActiveTool] = useState<WorkspaceTool>("select");
  const [markups, setMarkups] = useState<PdfMarkup[]>([]);
  const [shapeKind, setShapeKind] = useState<ShapeKind>("rectangle");
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false);
  const [redactKind, setRedactKind] = useState<"redact" | "erase">("redact");
  const [pageTransform, setPageTransform] = useState<PdfTransform>([1, 0, 0, -1, 0, 0]);
  const [signatureDraft, setSignatureDraft] = useState<Array<{ x: number; y: number }> | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMessage, setSearchMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [showThumbnails, setShowThumbnails] = useState(true);
  const [showDetails, setShowDetails] = useState(false);
  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageSurfaceRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const pointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const pointerPointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const editInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const imageTargetRef = useRef<PdfRect | null>(null);
  const pageTransformRef = useRef<PdfTransform>([1, 0, 0, -1, 0, 0]);

  const originalFileUrl = `/api/documents/${documentId}/file`;
  const cleanFileUrl = `/api/documents/${documentId}/clean`;
  const fileUrl = viewMode === "clean" ? cleanFileUrl : originalFileUrl;

  const startOcrProcessing = useCallback(async (signal?: AbortSignal) => {
    try {
      const startResponse = await fetch(`/api/documents/${documentId}/process`, { method: "POST", signal, cache: "no-store" });
      const startStatus = await startResponse.json() as OcrStatus;
      setOcrStatus(startStatus);
      if (startStatus.status === "failed") return;
      if (startStatus.status === "completed") {
        setViewMode("clean");
        return;
      }

      while (!signal?.aborted) {
        await new Promise((resolve) => setTimeout(resolve, 1500));
        if (signal?.aborted) return;
        const statusResponse = await fetch(`/api/documents/${documentId}/process`, { cache: "no-store", signal });
        if (!statusResponse.ok) throw new Error("OCR status could not be loaded. Reload the page to retry.");
        const nextStatus = await statusResponse.json() as OcrStatus;
        setOcrStatus(nextStatus);
        if (nextStatus.status === "completed") {
          setViewMode("clean");
          setFitToPage(true);
          return;
        }
        if (nextStatus.status === "failed") return;
      }
    } catch (reason) {
      if (signal?.aborted) return;
      setOcrStatus({
        status: "failed",
        error: reason instanceof Error ? reason.message : "OCR status could not be loaded. Reload the page to retry.",
      });
    }
  }, [documentId, setViewMode]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => void startOcrProcessing(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [startOcrProcessing]);

  useEffect(() => {
    setEdits({});
    setEditingKey(null);
    setEditMode(false);
    try {
      const saved = localStorage.getItem(`clearpdf:edits:${documentId}`);
      if (saved) setEdits(JSON.parse(saved) as Record<string, PdfTextEdit>);
    } catch {
      localStorage.removeItem(`clearpdf:edits:${documentId}`);
    }
  }, [documentId]);

  useEffect(() => {
    let active = true;
    let loadingTask: { promise: Promise<PDFDocumentProxy>; destroy: () => Promise<void> } | null = null;

    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const [metadataResponse, pdfjs] = await Promise.all([
          fetch(`/api/documents/${documentId}`, { cache: "no-store" }),
          import("pdfjs-dist"),
        ]);
        if (!metadataResponse.ok) throw new Error("This document could not be found. Upload it again to continue.");
        const documentMetadata = (await metadataResponse.json()) as DocumentMetadata;
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        loadingTask = pdfjs.getDocument({ url: fileUrl });
        const pdf = await loadingTask.promise;
        if (!active) return;
        setMetadata(documentMetadata);
        setPdfDocument(pdf);
        setPageCount(pdf.numPages);
        setLoading(false);
      } catch (reason) {
        if (!active) return;
        setError(reason instanceof Error ? reason.message : "This PDF could not be opened.");
        setLoading(false);
      }
    };

    void load();
    return () => {
      active = false;
      if (loadingTask) void loadingTask.destroy().catch(() => undefined);
    };
  }, [documentId, fileUrl]);

  useEffect(() => {
    const node = stageRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setStageSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!pdfDocument || !canvasRef.current) return;
    let canceled = false;
    let task: RenderTask | undefined;

    const render = async () => {
      try {
        if (pageNumber > pdfDocument.numPages) {
          const blankPage = addedBlankPages[pageNumber - pdfDocument.numPages - 1];
          const canvas = canvasRef.current;
          const context = canvas?.getContext("2d");
          if (!blankPage || !canvas || !context) return;
          const rotated = rotation % 180 !== 0;
          const baseWidth = rotated ? blankPage.height : blankPage.width;
          const baseHeight = rotated ? blankPage.width : blankPage.height;
          const fittedScale = fitToPage && stageSize.width
            ? Math.min((stageSize.width - 112) / baseWidth, (stageSize.height - 130) / baseHeight, 1.4)
            : zoom;
          const scale = Math.max(0.25, fittedScale);
          const width = baseWidth * scale;
          const height = baseHeight * scale;
          const outputScale = Math.min(Math.max(window.devicePixelRatio || 1, 2), 3);
          setRenderScale(scale);
          setRenderSize({ width, height });
          canvas.width = Math.floor(width * outputScale);
          canvas.height = Math.floor(height * outputScale);
          canvas.style.width = `${Math.floor(width)}px`;
          canvas.style.height = `${Math.floor(height)}px`;
          context.setTransform(1, 0, 0, 1, 0, 0);
          context.fillStyle = "#fff";
          context.fillRect(0, 0, canvas.width, canvas.height);
          return;
        }

        const page = await pdfDocument.getPage(pageNumber);
        if (canceled || !canvasRef.current) return;
        const pageRotation = (page.rotate + rotation) % 360;
        const baseViewport = page.getViewport({ scale: 1, rotation: pageRotation });
        const fittedScale = fitToPage && stageSize.width
          ? Math.min((stageSize.width - 112) / baseViewport.width, (stageSize.height - 130) / baseViewport.height, 1.4)
          : zoom;
        const viewport = page.getViewport({ scale: Math.max(0.25, fittedScale), rotation: pageRotation });
        setRenderScale(Math.max(0.25, fittedScale));
        setRenderSize({ width: viewport.width, height: viewport.height });
        const canvas = canvasRef.current;
        const context = canvas.getContext("2d");
        if (!context) return;
        // Render above CSS resolution even on standard-density screens so
        // vector text and fine document lines stay crisp when displayed.
        const outputScale = Math.min(Math.max(window.devicePixelRatio || 1, 2), 3);
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        task = page.render({
          canvas,
          canvasContext: context,
          viewport,
          transform: outputScale === 1 ? undefined : [outputScale, 0, 0, outputScale, 0, 0],
        });
        await task.promise;
      } catch (reason) {
        if (!canceled && !(reason instanceof Error && reason.name === "RenderingCancelledException")) {
          setError("This page could not be rendered. Try reloading the document.");
        }
      }
    };

    void render();
    return () => {
      canceled = true;
      task?.cancel();
    };
  }, [pdfDocument, pageNumber, addedBlankPages, zoom, rotation, fitToPage, stageSize.width, stageSize.height]);

  useEffect(() => {
    if (!pdfDocument) return;
    let active = true;
    setTextRuns([]);
    setPageText("");
    if (pageNumber > pdfDocument.numPages) return () => { active = false; };
    const readPageText = async () => {
      try {
        const [page, pdfjs] = await Promise.all([pdfDocument.getPage(pageNumber), import("pdfjs-dist")]);
        const pageRotation = (page.rotate + rotation) % 360;
        const viewport = page.getViewport({ scale: 1, rotation: pageRotation });
        const content = await page.getTextContent();
        const fontNames = Array.from(new Set(content.items.flatMap((item) => "str" in item ? [item.fontName] : [])));
        const fontEntries = await Promise.all(fontNames.map(async (fontName) => [fontName, await getPdfJsFont(page, fontName)] as const));
        const pdfFonts = new Map(fontEntries);
        const runs: PdfTextRun[] = content.items.flatMap((item, index) => {
          if (!("str" in item) || !item.str.trim()) return [];
          const transform = pdfjs.Util.transform(viewport.transform, item.transform);
          const fontSize = Math.max(5, Math.hypot(transform[2], transform[3]));
          const font = content.styles[item.fontName];
          const pdfFont = pdfFonts.get(item.fontName);
          const left = transform[4];
          const top = transform[5] - fontSize * (font?.ascent ?? 0.8);
          const width = Math.max(Math.abs(item.width), fontSize * 0.55);
          const height = Math.max(fontSize * 1.14, Math.abs(item.height) * 0.85);
          const padX = Math.max(0.7, fontSize * 0.05);
          const padY = Math.max(0.5, fontSize * 0.04);
          const corners = [
            viewport.convertToPdfPoint(left - padX, top - padY),
            viewport.convertToPdfPoint(left + width + padX, top - padY),
            viewport.convertToPdfPoint(left + width + padX, top + height + padY),
            viewport.convertToPdfPoint(left - padX, top + height + padY),
          ];
          const xs = corners.map(([x]) => x);
          const ys = corners.map(([, y]) => y);
          const x = Math.min(...xs);
          const y = Math.min(...ys);
          return [{
            key: `page-${pageNumber}-text-${index}`,
            pageNumber,
            fontName: item.fontName,
            text: item.str,
            left,
            top,
            width,
            height,
            fontSize,
            fontFamily: resolveFontFamily(pdfFont, font?.fontFamily),
            fontWeight: pdfFont?.cssFontInfo?.fontWeight ?? (pdfFont?.bold ? 700 : 400),
            fontItalic: pdfFont?.italic ?? Boolean(pdfFont?.cssFontInfo?.italicAngle),
            rotation: Math.atan2(transform[1], transform[0]),
            rect: { x, y, width: Math.max(1, Math.max(...xs) - x), height: Math.max(1, Math.max(...ys) - y) },
          }];
        });
        if (active) {
          setTextRuns(runs);
          setPageText(runs.map((run) => run.text).join(" "));
        }
      } catch {
        if (active) { setTextRuns([]); setPageText(""); }
      }
    };
    void readPageText();
    return () => { active = false; };
  }, [pdfDocument, pageNumber, rotation]);

  const goToPage = useCallback((next: number) => {
    setPageNumber(Math.min(totalPageCount || 1, Math.max(1, next)));
  }, [totalPageCount]);

  const searchDocument = useCallback(async () => {
    const query = searchQuery.trim();
    if (!query || !pdfDocument) return;
    setSearchMessage("Searching…");
    for (let offset = 0; offset < pdfDocument.numPages; offset += 1) {
      const candidate = ((pageNumber - 1 + offset) % pdfDocument.numPages) + 1;
      const page = await pdfDocument.getPage(candidate);
      const content = await page.getTextContent();
      const text = content.items.map((item) => ("str" in item ? item.str : "")).join(" ");
      if (text.toLocaleLowerCase().includes(query.toLocaleLowerCase())) {
        goToPage(candidate);
        setSearchMessage(`Match found on page ${candidate}.`);
        return;
      }
    }
    setSearchMessage("No match found in selectable PDF text.");
  }, [goToPage, pageNumber, pdfDocument, searchQuery]);

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") void searchDocument();
  };

  const zoomIn = () => {
    setFitToPage(false);
    setZoom((value) => Math.min(2.5, Math.round((value + 0.1) * 100) / 100));
  };
  const zoomOut = () => {
    setFitToPage(false);
    setZoom((value) => Math.max(0.25, Math.round((value - 0.1) * 100) / 100));
  };

  const viewItems = useMemo<ExpandingButtonGroupItem[]>(() => [
    { id: "original", label: "Original PDF", icon: <FileText />, onSelect: () => { setViewMode("original"); setFitToPage(true); } },
    { id: "clean", label: "Clean View", icon: <CheckCircle2 />, disabled: ocrStatus.status !== "completed", onSelect: () => { setViewMode("clean"); setFitToPage(true); } },
  ], [ocrStatus.status]);

  const handleCopyText = async () => {
    if (!pageText) {
      setSearchMessage("This page has no selectable text. Scanned pages need completed OCR before their text can be copied.");
      return;
    }

    const legacyCopy = () => {
      const textArea = document.createElement("textarea");
      textArea.value = pageText;
      textArea.setAttribute("readonly", "");
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.select();
      const copied = document.execCommand("copy");
      textArea.remove();
      if (!copied) throw new Error("Clipboard access was blocked.");
    };

    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(pageText);
      else legacyCopy();
      setSearchMessage("Page text copied to clipboard.");
    } catch {
      try {
        legacyCopy();
        setSearchMessage("Page text copied to clipboard.");
      } catch {
        setSearchMessage("Copy was blocked. Select the text in the Page text panel and copy it manually.");
      }
    }
  };

  const beginInlineEdit = (run: PdfTextRun) => {
    const saved = edits[run.key];
    setDraftRun(run);
    setDraftText(saved?.value ?? run.text);
    setEditingKey(run.key);
    setEditNotice("Edit the text, then press Enter or click outside the field to save.");
  };

  const cancelInlineEdit = () => {
    setEditingKey(null);
    setDraftRun(null);
    setDraftText("");
    setSelectionPreview(null);
  };

  const commitInlineEdit = () => {
    if (!editingKey || !draftRun) return;
    const next = { ...edits };
    if (!draftRun.manual && draftText === draftRun.text) delete next[editingKey];
    else next[editingKey] = { ...draftRun, value: draftText };
    setEdits(next);
    try { localStorage.setItem(`clearpdf:edits:${documentId}`, JSON.stringify(next)); } catch { /* The edit remains available for export in this tab. */ }
    setEditingKey(null);
    setDraftRun(null);
    setDraftText("");
    setEditNotice(draftRun.manual ? "Replacement saved for this page." : "Text replacement saved.");
    setSelectionPreview(null);
  };

  const addBlankPage = async () => {
    if (!pdfDocument) return;
    if (editingKey) commitInlineEdit();
    try {
      let pageSize = addedBlankPages[addedBlankPages.length - 1];
      if (!pageSize) {
        const lastPage = await pdfDocument.getPage(pdfDocument.numPages);
        pageSize = {
          width: lastPage.view[2] - lastPage.view[0],
          height: lastPage.view[3] - lastPage.view[1],
        };
      }
      if (pageSize.width <= 0 || pageSize.height <= 0) throw new Error("The current PDF page size is invalid.");

      const nextPages = [...addedBlankPages, pageSize];
      const nextPageNumber = pdfDocument.numPages + nextPages.length;
      setPageAddition({ documentId, pages: nextPages });
      setPageNumber(nextPageNumber);
      setShownThumbnails((count) => Math.max(count, nextPageNumber));
      setFitToPage(true);
      setSearchMessage("Blank page added. Download the edited PDF to keep it.");
    } catch {
      setSearchMessage("A blank page could not be added to this PDF.");
    }
  };

  const toggleEditMode = () => {
    if (editMode) {
      if (editingKey) commitInlineEdit();
      setEditMode(false);
      setEditNotice("");
      return;
    }
    setEditMode(true);
    setEditNotice(textRuns.length ? "Click any selectable text on the page to edit it." : "Scanned page: drag over the text you want to replace, then enter the replacement.");
  };

  const onEditPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!editMode || editingKey || event.target !== event.currentTarget || !pageSurfaceRef.current) return;
    const bounds = pageSurfaceRef.current.getBoundingClientRect();
    pointerStartRef.current = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    event.currentTarget.setPointerCapture(event.pointerId);
    setSelectionPreview({ left: pointerStartRef.current.x, top: pointerStartRef.current.y, width: 0, height: 0 });
  };

  const onEditPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointerStartRef.current || !pageSurfaceRef.current) return;
    const bounds = pageSurfaceRef.current.getBoundingClientRect();
    const end = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    const start = pointerStartRef.current;
    setSelectionPreview({ left: Math.min(start.x, end.x), top: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) });
  };

  const onEditPointerUp = async (event: ReactPointerEvent<HTMLDivElement>) => {
    const start = pointerStartRef.current;
    const surface = pageSurfaceRef.current;
    pointerStartRef.current = null;
    if (!start || !surface || !pdfDocument) return;
    const bounds = surface.getBoundingClientRect();
    const end = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
    const box = { left: Math.min(start.x, end.x), top: Math.min(start.y, end.y), width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y) };
    if (box.width < 8 || box.height < 8) {
      setSelectionPreview(null);
      setEditNotice("Drag around a text area to set its replacement bounds.");
      return;
    }
    try {
      const page = await pdfDocument.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1, rotation: (page.rotate + rotation) % 360 });
      const corners = [
        viewport.convertToPdfPoint(box.left / renderScale, box.top / renderScale),
        viewport.convertToPdfPoint((box.left + box.width) / renderScale, box.top / renderScale),
        viewport.convertToPdfPoint((box.left + box.width) / renderScale, (box.top + box.height) / renderScale),
        viewport.convertToPdfPoint(box.left / renderScale, (box.top + box.height) / renderScale),
      ];
      const xs = corners.map(([x]) => x);
      const ys = corners.map(([, y]) => y);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      const run: PdfTextRun = {
        key: `manual-${pageNumber}-${Date.now()}`,
        pageNumber,
        fontName: "",
        text: "",
        left: box.left / renderScale,
        top: box.top / renderScale,
        width: box.width / renderScale,
        height: box.height / renderScale,
        fontSize: Math.max(7, Math.min(18, box.height / renderScale * 0.72)),
        fontFamily: "Arial, sans-serif",
        fontWeight: 400,
        fontItalic: false,
        rotation: 0,
        manual: true,
        rect: { x, y, width: Math.max(1, Math.max(...xs) - x), height: Math.max(1, Math.max(...ys) - y) },
      };
      setDraftRun(run);
      setDraftText("");
      setEditingKey(run.key);
      setSelectionPreview(null);
      setEditNotice("Type the replacement for the selected area, then press Enter to save.");
    } catch {
      setSelectionPreview(null);
      setEditNotice("This area could not be selected. Try again on the current page.");
    }
  };

  const exportEditedPdf = async () => {
    const currentEditMap = { ...edits };
    if (editingKey && draftRun) currentEditMap[editingKey] = { ...draftRun, value: draftText };
    const currentEdits = Object.values(currentEditMap).filter((edit) => edit.manual || edit.value !== edit.text);
    if (!currentEdits.length && !addedBlankPages.length) return;
    if (editingKey) commitInlineEdit();
    try {
      const [{ PDFDocument, StandardFonts, rgb, degrees }, fontkitModule, response] = await Promise.all([
        import("pdf-lib"),
        import("@pdf-lib/fontkit"),
        fetch(fileUrl, { cache: "no-store" }),
      ]);
      if (!response.ok) throw new Error("The original PDF could not be loaded for export.");
      const pdf = await PDFDocument.load(await response.arrayBuffer());
      for (const pageSize of addedBlankPages) pdf.addPage([pageSize.width, pageSize.height]);
      pdf.registerFontkit(fontkitModule.default);
      const fontCache = new Map<string, Awaited<ReturnType<typeof pdf.embedFont>>>();
      let usedFallbackFont = false;
      for (const edit of currentEdits) {
        const page = pdf.getPage(edit.pageNumber - 1);
        if (!page) continue;
        const { x, y, width, height } = edit.rect;
        page.drawRectangle({ x, y, width, height, color: rgb(1, 1, 1) });
        if (!edit.value) continue;
        const cacheKey = edit.fontName || `${edit.fontFamily}-${edit.fontWeight}-${edit.fontItalic}`;
        let font = fontCache.get(cacheKey);
        if (!font) {
          let embeddedFontData: Uint8Array | undefined;
          if (edit.fontName && pdfDocument) {
            const sourcePage = await pdfDocument.getPage(edit.pageNumber);
            await sourcePage.getOperatorList();
            embeddedFontData = (await getPdfJsFont(sourcePage, edit.fontName))?.data ?? undefined;
          }
          if (embeddedFontData?.length) {
            try {
              font = await pdf.embedFont(embeddedFontData, { subset: true });
            } catch {
              usedFallbackFont = true;
            }
          }
          if (!font) {
            const family = edit.fontFamily.toLocaleLowerCase();
            const bold = edit.fontWeight >= 600;
            const italic = edit.fontItalic;
            const isCourier = /courier|mono|typewriter/.test(family);
            const isTimes = !isCourier && !/sans/.test(family) && /times|serif/.test(family);
            const standardFont = isCourier
              ? (bold ? (italic ? StandardFonts.CourierBoldOblique : StandardFonts.CourierBold) : (italic ? StandardFonts.CourierOblique : StandardFonts.Courier))
              : isTimes
                ? (bold ? (italic ? StandardFonts.TimesRomanBoldItalic : StandardFonts.TimesRomanBold) : (italic ? StandardFonts.TimesRomanItalic : StandardFonts.TimesRoman))
                : (bold ? (italic ? StandardFonts.HelveticaBoldOblique : StandardFonts.HelveticaBold) : (italic ? StandardFonts.HelveticaOblique : StandardFonts.Helvetica));
            font = await pdf.embedFont(standardFont);
            if (embeddedFontData?.length) usedFallbackFont = true;
          }
          fontCache.set(cacheKey, font);
        }
        let fontSize = Math.max(5, Math.min(edit.fontSize, height * 0.88));
        const availableWidth = Math.max(1, width - 2);
        const textWidth = font.widthOfTextAtSize(edit.value, fontSize);
        if (textWidth > availableWidth) fontSize *= availableWidth / textWidth;
        page.drawText(edit.value, {
          x: x + 1,
          y: y + Math.max(0.5, (height - fontSize) / 2),
          size: Math.max(4, fontSize),
          font,
          color: rgb(0.08, 0.09, 0.11),
          rotate: degrees(-edit.rotation * 180 / Math.PI),
        });
      }
      const bytes = await pdf.save();
      const blob = new Blob([bytes.buffer as ArrayBuffer], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${metadata?.filename.replace(/\.pdf$/i, "") || "document"} (edited).pdf`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      const pageNote = addedBlankPages.length ? ` ${addedBlankPages.length} blank page${addedBlankPages.length === 1 ? "" : "s"} appended.` : "";
      setEditNotice(usedFallbackFont
        ? `Edited PDF downloaded.${pageNote} A close standard font was used where the source font could not be embedded.`
        : `Edited PDF downloaded.${pageNote} Your original file is unchanged.`);
    } catch (reason) {
      setEditNotice(reason instanceof Error ? reason.message : "The edited PDF could not be exported.");
    }
  };

  const downloadOriginal = () => window.location.assign(`${originalFileUrl}?download=1`);
  const downloadCurrentPdf = () => window.location.assign(`${fileUrl}?download=1`);
  const printOriginal = () => {
    const printWindow = window.open(`/documents/${documentId}/print`, "_blank");
    if (!printWindow) {
      setSearchMessage("Allow pop-ups for this site to open the print dialog.");
      return;
    }
    printWindow.opener = null;
  };
  const focusSearch = () => searchInputRef.current?.focus();
  const pageEdits = Object.values(edits).filter((edit) => edit.pageNumber === pageNumber);
  const pageHasEdits = pageEdits.length > 0;
  const toggleFullscreen = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void stageRef.current?.requestFullscreen?.();
  };

  if (error && !loading) {
    return (
      <main className={styles.errorPage}>
        <div className={styles.errorCard}>
          <AlertCircle size={24} aria-hidden="true" />
          <h1>Unable to open this PDF</h1>
          <p>{error}</p>
          <Button variant="secondary" onClick={() => window.location.assign("/")}>Back to upload</Button>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.workspace} data-view={viewMode}>
      <header className={styles.topbar}>
        <Button variant="secondary" size="sm" className={styles.backHomeButton} aria-label="Back to upload page" title="Back to upload page" onClick={() => router.push("/")}>
          <ArrowLeft size={16} aria-hidden="true" />
          <span>Back</span>
        </Button>

        <div className={styles.documentIdentity}>
          <FileText size={17} aria-hidden="true" />
          <span><strong title={metadata?.filename}>{metadata?.filename ?? "Loading document…"}</strong><small>{metadata ? formatSize(metadata.size) : `${totalPageCount || "—"} pages`}</small></span>
        </div>

        <div className={styles.topbarControls}>
          <div className={`${styles.toolbarGroup} ${styles.pageControls}`}>
            <Button variant="ghost" size="sm" aria-label="Previous page" title="Previous page" disabled={pageNumber <= 1} onClick={() => goToPage(pageNumber - 1)}>
              <ChevronLeft size={16} aria-hidden="true" />
            </Button>
            <label className={styles.pageNumberLabel}>
              <span className={styles.srOnly}>Current page</span>
              <input type="number" min={1} max={totalPageCount || 1} value={pageNumber} onChange={(event) => goToPage(Number(event.target.value) || 1)} />
            </label>
            <span className={styles.pageCount}>/ {totalPageCount || "—"}</span>
            <Button variant="ghost" size="sm" aria-label="Next page" title="Next page" disabled={!totalPageCount || pageNumber >= totalPageCount} onClick={() => goToPage(pageNumber + 1)}>
              <ChevronRight size={16} aria-hidden="true" />
            </Button>
          </div>

          <div className={`${styles.toolbarGroup} ${styles.zoomControls}`}>
            <Button variant="ghost" size="sm" aria-label="Zoom out" title="Zoom out" onClick={zoomOut}><ZoomOut size={15} aria-hidden="true" /></Button>
            <span className={styles.zoomValue}>{fitToPage ? "Fit" : `${Math.round(zoom * 100)}%`}</span>
            <Button variant="ghost" size="sm" aria-label="Zoom in" title="Zoom in" onClick={zoomIn}><ZoomIn size={15} aria-hidden="true" /></Button>
            <Button variant="ghost" size="sm" aria-label="Fit page" title="Fit page" onClick={() => setFitToPage(true)}><Maximize size={14} aria-hidden="true" /></Button>
          </div>

          <ExpandingButtonGroup label="Document viewing mode" items={viewItems} defaultExpanded={viewMode} className={styles.viewTabs} />

          <div className={styles.toolbarSearch}>
            <Search size={15} aria-hidden="true" />
            <input
              ref={searchInputRef}
              aria-label="Search in document"
              placeholder="Search in document…"
              value={searchQuery}
              onChange={(event) => { setSearchQuery(event.target.value); setSearchMessage(""); }}
              onKeyDown={onSearchKeyDown}
            />
            {searchQuery && <Button type="button" variant="ghost" size="sm" onClick={() => { setSearchQuery(""); setSearchMessage(""); }} aria-label="Clear search" title="Clear search">×</Button>}
          </div>

          <div className={styles.topbarActions}>
            <Button variant="ghost" size="sm" aria-label={viewMode === "clean" ? "Download cleaned PDF" : "Download original PDF"} title={viewMode === "clean" ? "Download cleaned PDF" : "Download original PDF"} onClick={downloadCurrentPdf} disabled={!metadata || (viewMode === "clean" && ocrStatus.status !== "completed")}><Download size={16} aria-hidden="true" /></Button>
            <Button variant="ghost" size="sm" aria-label="Open original PDF for printing" title="Print original PDF" onClick={printOriginal} disabled={!metadata}><Printer size={16} aria-hidden="true" /></Button>
            <Button variant="ghost" size="sm" aria-label="Toggle document details" title="Document details and extracted text" onClick={() => setShowDetails((shown) => !shown)}><PanelRight size={16} aria-hidden="true" /></Button>
          </div>
        </div>
      </header>

      <div className={styles.toolStrip}>
        <div className={styles.toolStripActions}>
          <Button variant="ghost" size="sm" className={`${styles.toolButton} ${showThumbnails ? styles.toolButtonActive : ""}`} aria-pressed={showThumbnails} onClick={() => setShowThumbnails((shown) => !shown)}><PanelLeft size={16} aria-hidden="true" /><span>Pages</span></Button>
          <Button variant="ghost" size="sm" className={`${styles.toolButton} ${showDetails ? styles.toolButtonActive : ""}`} aria-pressed={showDetails} onClick={() => setShowDetails((shown) => !shown)}><FileText size={16} aria-hidden="true" /><span>Page text</span></Button>
          <Button variant="ghost" size="sm" className={styles.toolButton} aria-label="Rotate view clockwise" title="Rotate view clockwise" onClick={() => setRotation((value) => (value + 90) % 360)}><RotateCw size={16} aria-hidden="true" /><span>Rotate view</span></Button>
          <Button variant="ghost" size="sm" className={styles.toolButton} aria-label="Copy page text" title={pageText ? "Copy page text" : "No selectable text on this page"} disabled={!pageText} onClick={() => void handleCopyText()}><Copy size={15} aria-hidden="true" /><span>Copy text</span></Button>
          <Button variant="ghost" size="sm" className={styles.toolButton} aria-label="Search document" title="Search document" onClick={focusSearch}><Search size={15} aria-hidden="true" /><span>Find</span></Button>
        </div>
        <div className={styles.toolStripEnd}>
          {editMode && <span className={styles.editHint} role="status">{editNotice || (textRuns.length ? "Click text to edit" : "Drag over text to replace it")}</span>}
          {(Object.keys(edits).length > 0 || addedBlankPages.length > 0) && <Button variant="primary" size="sm" className={styles.exportEditButton} onClick={() => void exportEditedPdf()}><Download size={14} aria-hidden="true" /><span>Download edited PDF</span></Button>}
          {!editMode && !pageHasEdits && addedBlankPages.length === 0 && <div className={styles.toolStripStatus}><span className={styles.statusDot} /><span>{ocrStatus.status === "failed" ? "OCR failed" : viewMode === "clean" ? "Clean OCR PDF" : ocrStatus.status === "processing" ? "OCR processing" : "Original PDF"}</span><span className={styles.statusDivider} />{ocrStatus.status === "failed" ? "Open Page text for details" : viewMode === "clean" ? "Searchable text added; original preserved" : "The uploaded file remains unchanged"}</div>}
          {!editMode && (pageHasEdits || addedBlankPages.length > 0) && <div className={styles.toolStripStatus}><span className={styles.statusDot} /><span>Edited preview</span><span className={styles.statusDivider} />Original file is unchanged</div>}
        </div>
      </div>

      <div className={styles.workspaceBody}>
        <nav className={styles.sideRail} aria-label="Workspace tools">
          <Button variant="ghost" size="sm" className={`${styles.railButton} ${showThumbnails ? styles.railButtonActive : ""}`} aria-label="Toggle pages panel" aria-pressed={showThumbnails} title="Pages" onClick={() => setShowThumbnails((shown) => !shown)}><PanelLeft size={18} aria-hidden="true" /></Button>
          <Button variant="ghost" size="sm" className={`${styles.railButton} ${editMode ? styles.railButtonActive : ""}`} aria-pressed={editMode} aria-label={editMode ? "Finish editing PDF" : "Edit PDF text"} title={editMode ? "Finish editing" : "Edit PDF text"} onClick={toggleEditMode}><Pencil size={18} aria-hidden="true" /></Button>
          <Button variant="ghost" size="sm" className={`${styles.railButton} ${showDetails ? styles.railButtonActive : ""}`} aria-label="Toggle text and document information" aria-pressed={showDetails} title="Text and document information" onClick={() => setShowDetails((shown) => !shown)}><FileText size={18} aria-hidden="true" /></Button>
          <Button variant="ghost" size="sm" className={styles.railButton} aria-label="Find text" title="Find text" onClick={focusSearch}><Search size={18} aria-hidden="true" /></Button>
          <Button variant="ghost" size="sm" className={styles.railButton} aria-label="Download original PDF" title="Download original PDF" onClick={downloadOriginal} disabled={!metadata}><Download size={18} aria-hidden="true" /></Button>
        </nav>

        <div className={styles.contentGrid}>
        {showThumbnails && (
          <aside className={styles.thumbnailRail} aria-label="PDF pages">
            <div className={styles.railHeading}>
              <h2>Thumbnails</h2>
              <span>{totalPageCount || "—"}</span>
            </div>
            {pdfDocument ? (
              <div className={styles.thumbnailList}>
                {Array.from({ length: Math.min(totalPageCount, shownThumbnails) }, (_, index) => index + 1).map((page) => page <= pdfDocument.numPages ? (
                  <PdfThumbnail key={page} document={pdfDocument} pageNumber={page} active={page === pageNumber} onSelect={goToPage} />
                ) : (
                  <BlankPageThumbnail key={page} pageNumber={page} active={page === pageNumber} onSelect={goToPage} />
                ))}
                {shownThumbnails < totalPageCount && (
                  <Button variant="ghost" size="sm" onClick={() => setShownThumbnails((count) => Math.min(totalPageCount, count + 12))}>
                    Show more pages
                  </Button>
                )}
              </div>
            ) : (
              <div className={styles.thumbnailLoading}>{loading ? "Loading pages…" : "No pages to show"}</div>
            )}
            <Button variant="secondary" size="sm" className={styles.addPageButton} aria-label="Add a blank page to the end of the PDF" title="Add a blank page to the end of the PDF" disabled={!pdfDocument} onClick={() => void addBlankPage()}>
              <Plus size={14} aria-hidden="true" />
              <span>Add Page</span>
            </Button>
          </aside>
        )}

        <section className={styles.documentStage} ref={stageRef} aria-label="PDF preview">
          <div className={styles.stageHeading}>
            <span className={styles.stageMode}><span /> {pageHasEdits || addedBlankPages.length > 0 ? "EDITED PREVIEW" : editMode ? "EDIT MODE" : viewMode === "clean" ? "CLEAN OCR PDF" : "ORIGINAL PDF"}</span>
            <span className={styles.stageNote}>{metadata?.filename ?? "PDF document"}</span>
          </div>
          <div className={styles.pageViewport}>
            {loading && <div className={styles.loadingMessage}><span className={styles.spinner} />Loading your PDF…</div>}
            {pdfDocument && (
              <div ref={pageSurfaceRef} className={styles.pageSurface} style={{ width: renderSize.width || undefined, height: renderSize.height || undefined }}>
                <canvas ref={canvasRef} className={styles.pageCanvas} aria-label={`Page ${pageNumber} of ${totalPageCount}`} />
                {!editMode && !pageHasEdits && textRuns.length > 0 && (
                  <div className={styles.textSelectionLayer} aria-hidden="true">
                    {textRuns.map((run) => (
                      <span
                        key={run.key}
                        className={styles.selectableText}
                        style={{
                          left: run.left * renderScale,
                          top: run.top * renderScale,
                          width: Math.max(run.width, run.fontSize * 0.55) * renderScale,
                          height: Math.max(run.height, run.fontSize) * renderScale,
                          fontSize: run.fontSize * renderScale,
                          fontFamily: run.fontFamily,
                          fontWeight: run.fontWeight,
                          fontStyle: run.fontItalic ? "italic" : "normal",
                          transform: `rotate(${run.rotation}rad)`,
                        }}
                      >
                        {run.text}
                      </span>
                    ))}
                  </div>
                )}
                {(editMode || pageHasEdits) && (
                  <div
                    className={`${styles.textEditLayer} ${editMode ? styles.textEditLayerActive : ""}`}
                    aria-label={editMode ? "Editable PDF text layer" : "Edited text preview"}
                    onPointerDown={onEditPointerDown}
                    onPointerMove={onEditPointerMove}
                    onPointerUp={(event) => void onEditPointerUp(event)}
                    onPointerCancel={() => { pointerStartRef.current = null; setSelectionPreview(null); }}
                  >
                    {(editMode ? [...textRuns, ...pageEdits.filter((edit) => edit.manual), ...(draftRun?.manual && draftRun.pageNumber === pageNumber && !pageEdits.some((edit) => edit.key === draftRun.key) ? [draftRun] : [])] : pageEdits).map((run) => {
                      const saved = edits[run.key];
                      const value = saved?.value ?? run.text;
                      const width = Math.max(run.width, run.fontSize * 0.55) * renderScale;
                      const height = Math.max(run.height, run.fontSize) * renderScale;
                      const itemStyle: CSSProperties = {
                        left: run.left * renderScale,
                        top: run.top * renderScale,
                        width: Math.max(width, run.fontSize * renderScale * 0.7),
                        height,
                        fontSize: run.fontSize * renderScale,
                        fontFamily: run.fontFamily,
                        fontWeight: run.fontWeight,
                        fontStyle: run.fontItalic ? "italic" : "normal",
                        transform: `rotate(${run.rotation}rad)`,
                      };
                      if (editingKey === run.key) {
                        return <input key={run.key} ref={editInputRef} autoFocus className={styles.inlineTextInput} style={itemStyle} value={draftText} aria-label={`Edit PDF text ${run.text || "replacement"}`} onChange={(event) => setDraftText(event.target.value)} onBlur={commitInlineEdit} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); event.currentTarget.blur(); } if (event.key === "Escape") { event.preventDefault(); cancelInlineEdit(); } }} />;
                      }
                      if (editMode) {
                        return <button key={run.key} type="button" className={`${styles.editTextHit} ${saved ? styles.changedTextHit : ""} ${run.manual ? styles.manualTextHit : ""}`} style={itemStyle} title="Click to edit this text" onClick={() => beginInlineEdit(run)}>{value}</button>;
                      }
                      return <span key={run.key} className={`${styles.editTextHit} ${styles.changedTextHit} ${styles.editedTextPreview}`} style={itemStyle}>{value}</span>;
                    })}
                    {selectionPreview && <span className={styles.selectionPreview} style={selectionPreview} />}
                  </div>
                )}
              </div>
            )}
            <div className={styles.floatingControls} aria-label="Page and zoom controls">
              <Button variant="ghost" size="sm" aria-label="Previous page" title="Previous page" disabled={pageNumber <= 1} onClick={() => goToPage(pageNumber - 1)}><ChevronLeft size={16} aria-hidden="true" /></Button>
          <span>{pageNumber} <small>/ {totalPageCount || "—"}</small></span>
          <Button variant="ghost" size="sm" aria-label="Next page" title="Next page" disabled={!totalPageCount || pageNumber >= totalPageCount} onClick={() => goToPage(pageNumber + 1)}><ChevronRight size={16} aria-hidden="true" /></Button>
              <span className={styles.floatingDivider} />
              <Button variant="ghost" size="sm" aria-label="Zoom out" title="Zoom out" onClick={zoomOut}><ZoomOut size={15} aria-hidden="true" /></Button>
              <span className={styles.floatingZoom}>{fitToPage ? "Fit" : `${Math.round(zoom * 100)}%`}</span>
              <Button variant="ghost" size="sm" aria-label="Zoom in" title="Zoom in" onClick={zoomIn}><ZoomIn size={15} aria-hidden="true" /></Button>
              <Button variant="ghost" size="sm" aria-label="Toggle full screen" title="Toggle full screen" onClick={toggleFullscreen}><Maximize size={15} aria-hidden="true" /></Button>
            </div>
          </div>
          {searchMessage && <div className={styles.stageFooter} role="status">{searchMessage}</div>}
        </section>

        {showDetails && (
          <aside className={styles.detailsPanel} aria-label="Document details">
            <div className={styles.detailsHeader}>
              <h2>Document details</h2>
              <Button variant="ghost" size="sm" aria-label="Close details panel" title="Close details panel" onClick={() => setShowDetails(false)}>×</Button>
            </div>

            <section className={styles.detailSection}>
              <h3>Document information</h3>
              <dl className={styles.infoList}>
                <div><dt>File name</dt><dd title={metadata?.filename}>{metadata?.filename ?? "Loading…"}</dd></div>
                <div><dt>Pages</dt><dd>{totalPageCount || "—"}</dd></div>
                <div><dt>File size</dt><dd>{metadata ? formatSize(metadata.size) : "—"}</dd></div>
                <div><dt>Uploaded</dt><dd>{metadata ? formatDate(metadata.uploadedAt) : "—"}</dd></div>
              </dl>
            </section>

            <section className={styles.detailSection}>
              <div className={styles.sectionHeading}>
                <h3>Text on this page</h3>
                {pageText && <Button variant="ghost" size="sm" aria-label="Copy page text" title="Copy page text" onClick={() => void handleCopyText()}><Copy size={14} aria-hidden="true" /></Button>}
              </div>
              {pageText ? (
                <div className={styles.extractedText} tabIndex={0} aria-label="Selectable text from the PDF page">
                  <HighlightedText text={pageText} query={searchQuery} />
                </div>
              ) : (
                <p className={styles.emptyText}>{loading ? "Reading page text…" : "No selectable text found on this page. Scanned pages need OCR."}</p>
              )}
            </section>

            <section className={styles.detailSection}>
              <h3>OCR status</h3>
              <div className={styles.ocrStatus}><span className={styles.statusDot} /><strong>{ocrStatus.status === "completed" ? "Completed" : ocrStatus.status === "processing" ? "Processing" : ocrStatus.status === "failed" ? "Failed" : "Waiting"}</strong></div>
              <p className={styles.ocrNote} role={ocrStatus.status === "failed" ? "alert" : undefined}>
                {ocrStatus.status === "completed"
                  ? `${ocrStatus.completedPages ?? pageCount} of ${ocrStatus.totalPages ?? pageCount} pages processed. ${ocrStatus.warning ?? ""}`
                  : ocrStatus.status === "processing"
                    ? "Adobe is recognizing the scan and rebuilding its text and page layout into a selectable PDF."
                    : ocrStatus.status === "failed"
                      ? ocrStatus.error ?? "OCR could not process this PDF."
                      : "Adobe PDF Services OCR will start automatically."}
              </p>
              {ocrStatus.status === "failed" && <Button variant="secondary" size="sm" onClick={() => void startOcrProcessing()}>Retry OCR</Button>}
            </section>
          </aside>
        )}
        </div>
      </div>
    </main>
  );
}
