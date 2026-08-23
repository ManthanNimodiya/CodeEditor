import { useEffect, useRef, useState } from "react";
import mammoth from "mammoth";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx";

interface DocxEditorProps {
  path: string;
  visible: boolean;
}

interface RunFormat {
  bold?: boolean;
  italics?: boolean;
  underline?: boolean;
}

function parseRuns(node: Node, fmt: RunFormat): TextRun[] {
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent ?? "";
    return text
      ? [new TextRun({ text, bold: fmt.bold, italics: fmt.italics, underline: fmt.underline ? { type: "single" } : undefined })]
      : [];
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return [];
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  const f: RunFormat = { ...fmt };
  if (tag === "strong" || tag === "b") f.bold = true;
  if (tag === "em" || tag === "i") f.italics = true;
  if (tag === "u") f.underline = true;
  if (tag === "br") return [new TextRun({ break: 1 })];
  return Array.from(el.childNodes).flatMap((n) => parseRuns(n, f));
}

function toParagraphs(container: Element): Paragraph[] {
  const out: Paragraph[] = [];
  for (const el of Array.from(container.children)) {
    const tag = el.tagName.toLowerCase();
    if (tag === "ul" || tag === "ol") {
      for (const li of Array.from(el.querySelectorAll(":scope > li"))) {
        const runs = Array.from(li.childNodes).flatMap((n) => parseRuns(n, {}));
        out.push(new Paragraph({ bullet: { level: 0 }, children: runs.length ? runs : [new TextRun("")] }));
      }
      continue;
    }
    const runs = Array.from(el.childNodes).flatMap((n) => parseRuns(n, {}));
    const children = runs.length ? runs : [new TextRun("")];
    if (tag === "h1") out.push(new Paragraph({ heading: HeadingLevel.HEADING_1, children }));
    else if (tag === "h2") out.push(new Paragraph({ heading: HeadingLevel.HEADING_2, children }));
    else if (tag === "h3") out.push(new Paragraph({ heading: HeadingLevel.HEADING_3, children }));
    else out.push(new Paragraph({ children }));
  }
  if (out.length === 0) out.push(new Paragraph({ children: [new TextRun("")] }));
  return out;
}

export default function DocxEditor({ path, visible }: DocxEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [statusMsg, setStatusMsg] = useState("");

  useEffect(() => {
    setStatus("loading");
    setStatusMsg("");
    readFile(path)
      .then((bytes) => mammoth.convertToHtml({ arrayBuffer: bytes.buffer as ArrayBuffer }))
      .then((result) => {
        if (editorRef.current) editorRef.current.innerHTML = result.value || "<p>Empty document</p>";
        setStatus("ready");
      })
      .catch((e) => {
        setStatus("error");
        setStatusMsg(String(e));
      });
  }, [path]);

  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        save();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  async function save() {
    if (!editorRef.current) return;
    setStatusMsg("Saving…");
    try {
      const paragraphs = toParagraphs(editorRef.current);
      const doc = new Document({ sections: [{ children: paragraphs }] });
      const blob = await Packer.toBlob(doc);
      const buf = await blob.arrayBuffer();
      await writeFile(path, new Uint8Array(buf));
      setStatusMsg("Saved");
      setTimeout(() => setStatusMsg(""), 1500);
    } catch (e) {
      setStatusMsg(`Save failed: ${e}`);
    }
  }

  function exec(command: string, value?: string) {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
  }

  return (
    <div className="docx-editor" style={{ display: visible ? "flex" : "none" }}>
      <div className="docx-toolbar">
        <button onMouseDown={(e) => { e.preventDefault(); exec("bold"); }} title="Bold (⌘B)"><b>B</b></button>
        <button onMouseDown={(e) => { e.preventDefault(); exec("italic"); }} title="Italic (⌘I)"><i>I</i></button>
        <button onMouseDown={(e) => { e.preventDefault(); exec("underline"); }} title="Underline (⌘U)"><u>U</u></button>
        <span className="docx-toolbar-sep" />
        <button onMouseDown={(e) => { e.preventDefault(); exec("formatBlock", "h1"); }} title="Heading 1">H1</button>
        <button onMouseDown={(e) => { e.preventDefault(); exec("formatBlock", "h2"); }} title="Heading 2">H2</button>
        <button onMouseDown={(e) => { e.preventDefault(); exec("formatBlock", "h3"); }} title="Heading 3">H3</button>
        <button onMouseDown={(e) => { e.preventDefault(); exec("formatBlock", "p"); }} title="Paragraph">P</button>
        <span className="docx-toolbar-sep" />
        <button onMouseDown={(e) => { e.preventDefault(); exec("insertUnorderedList"); }} title="Bullet list">• List</button>
        <button onMouseDown={(e) => { e.preventDefault(); exec("insertOrderedList"); }} title="Numbered list">1. List</button>
        <span className="docx-toolbar-sep" />
        <button onMouseDown={(e) => { e.preventDefault(); exec("removeFormat"); }} title="Clear formatting">Clear</button>
        <div className="docx-toolbar-spacer" />
        <span className="docx-status">{statusMsg}</span>
        <button onClick={save} className="docx-save-btn">Save (⌘S)</button>
      </div>

      {status === "loading" && <div className="docx-loading">Loading document…</div>}
      {status === "error" && <div className="docx-loading docx-error">Failed to open document: {statusMsg}</div>}

      <div
        ref={editorRef}
        className="docx-content"
        contentEditable={status === "ready"}
        suppressContentEditableWarning
        spellCheck
      />
    </div>
  );
}
