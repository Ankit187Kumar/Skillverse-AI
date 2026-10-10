"use client";

import dynamic from "next/dynamic";
import { useMemo } from "react";
import { cpp } from "@codemirror/lang-cpp";
import { java } from "@codemirror/lang-java";
import { javascript } from "@codemirror/lang-javascript";
import { python } from "@codemirror/lang-python";
import { oneDark } from "@codemirror/theme-one-dark";
import { EditorView } from "@codemirror/view";
import { useTheme } from "@/lib/theme";
import type { CodeLang } from "@/lib/types";
import { Skeleton } from "./ui/feedback";

const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), {
  ssr: false,
  loading: () => <Skeleton className="h-full min-h-80 w-full rounded-none" />,
});

const LANG = { python, javascript, java, cpp };

/** Syntax-highlighted code editor (CodeMirror 6) with light/dark themes. */
export function CodeEditor({
  value,
  onChange,
  language,
  readOnly,
  height = "100%",
  label = "Code editor",
}: {
  value: string;
  onChange?: (v: string) => void;
  language: CodeLang;
  readOnly?: boolean;
  height?: string;
  label?: string;
}) {
  const { theme } = useTheme();
  const extensions = useMemo(
    () => [
      LANG[language](),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ "aria-label": label }),
      EditorView.theme({
        "&": { fontSize: "14px", height: "100%" },
        ".cm-scroller": { fontFamily: 'ui-monospace, SFMono-Regular, "JetBrains Mono", Menlo, Consolas, monospace' },
      }),
    ],
    [language, label],
  );
  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      height={height}
      theme={theme === "dark" ? oneDark : "light"}
      extensions={extensions}
      readOnly={readOnly}
      basicSetup={{ lineNumbers: true, foldGutter: false, highlightActiveLine: !readOnly, autocompletion: true, tabSize: 4 }}
      className="h-full"
    />
  );
}
