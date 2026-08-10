"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type SpeechRecognitionLike = {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: SpeechRecognitionResultEventLike) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};

type SpeechRecognitionResultEventLike = {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    0: { transcript: string };
  }>;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

function appendTranscript(existing: string, chunk: string) {
  const next = chunk.trim();
  if (!next) return existing;
  if (!existing.trim()) return next;
  const needsSpace = !/\s$/.test(existing);
  return `${existing}${needsSpace ? " " : ""}${next}`;
}

export function useSpeechDictation(options: {
  value: string;
  onChange: (next: string) => void;
}) {
  const { value, onChange } = options;
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const valueRef = useRef(value);
  const baseRef = useRef(value);
  const lastEmittedRef = useRef(value);
  const wantListenRef = useRef(false);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  useEffect(() => {
    setSupported(Boolean(getSpeechRecognitionCtor()));
  }, []);

  useEffect(() => {
    return () => {
      wantListenRef.current = false;
      const rec = recognitionRef.current;
      if (rec) {
        rec.onresult = null;
        rec.onerror = null;
        rec.onend = null;
        try {
          rec.abort();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  const stop = useCallback(() => {
    wantListenRef.current = false;
    setListening(false);
    try {
      recognitionRef.current?.stop();
    } catch {
      // ignore
    }
  }, []);

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) {
      setError("Speech recognition is not supported in this browser.");
      return;
    }

    setError(null);
    wantListenRef.current = true;
    baseRef.current = valueRef.current;
    lastEmittedRef.current = valueRef.current;

    let rec = recognitionRef.current;
    if (!rec) {
      rec = new Ctor();
      recognitionRef.current = rec;
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = typeof navigator !== "undefined" ? navigator.language || "en-US" : "en-US";

      rec.onresult = (event) => {
        if (valueRef.current !== lastEmittedRef.current) {
          baseRef.current = valueRef.current;
        }

        let finalChunk = "";
        let interimChunk = "";
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          const result = event.results[i];
          const text = result[0]?.transcript ?? "";
          if (result.isFinal) finalChunk += text;
          else interimChunk += text;
        }

        let next = baseRef.current;
        if (finalChunk) {
          next = appendTranscript(baseRef.current, finalChunk);
          baseRef.current = next;
        }
        if (interimChunk) {
          next = appendTranscript(baseRef.current, interimChunk);
        }

        lastEmittedRef.current = next;
        onChange(next);
      };

      rec.onerror = (event) => {
        if (event.error === "aborted" || event.error === "no-speech") return;
        setError(event.error || "Speech recognition failed.");
        wantListenRef.current = false;
        setListening(false);
      };

      rec.onend = () => {
        if (wantListenRef.current) {
          try {
            rec?.start();
            return;
          } catch {
            wantListenRef.current = false;
          }
        }
        setListening(false);
      };
    }

    try {
      rec.start();
      setListening(true);
    } catch {
      setError("Could not start the microphone.");
      wantListenRef.current = false;
      setListening(false);
    }
  }, [onChange]);

  const toggle = useCallback(() => {
    if (listening) stop();
    else start();
  }, [listening, start, stop]);

  return { supported, listening, error, start, stop, toggle };
}
