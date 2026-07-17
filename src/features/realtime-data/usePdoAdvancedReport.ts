import { useEffect, useRef, useState } from 'react';
import { parsePdoAdvancedProject } from '../../api/commands';
import type { PdoAdvancedParseReport } from '../../types/platform';

export function usePdoAdvancedReport(document: unknown | null) {
  const [report, setReport] = useState<PdoAdvancedParseReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const documentRef = useRef(document);
  const generationRef = useRef(0);
  documentRef.current = document;

  useEffect(() => {
    documentRef.current = document;
    generationRef.current += 1;
    setReport(null);
    setError(null);
    setIsParsing(false);
  }, [document]);

  async function parse() {
    const targetDocument = document;
    if (!targetDocument) {
      setError('请先打开 .jcpro 项目。');
      return;
    }

    const generation = ++generationRef.current;
    setError(null);
    setReport(null);
    setIsParsing(true);
    try {
      const nextReport = await parsePdoAdvancedProject(targetDocument);
      if (generation !== generationRef.current || targetDocument !== documentRef.current) {
        return;
      }
      setReport(nextReport);
      if (!nextReport.valid) {
        setError(nextReport.errors.join('；') || '高级 PDO 配置存在问题');
      }
    } catch (cause) {
      if (generation === generationRef.current) {
        setError(cause instanceof Error ? cause.message : String(cause));
      }
    } finally {
      if (generation === generationRef.current) setIsParsing(false);
    }
  }

  return {
    canParse: Boolean(document),
    error,
    isParsing,
    parse,
    report,
  };
}

export type PdoAdvancedReportController = ReturnType<typeof usePdoAdvancedReport>;
