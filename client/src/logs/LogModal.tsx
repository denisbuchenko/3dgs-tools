import type { RefObject } from "react";
import type { LogMode } from "../types";

type LogModalProps = {
  firstLogIndex: number;
  logMode: LogMode;
  logRowHeight: number;
  logsLength: number;
  logViewportRef: RefObject<HTMLDivElement>;
  visibleLogs: string[];
  onClose: () => void;
  onScroll: (scrollTop: number) => void;
};

export function LogModal({
  firstLogIndex,
  logMode,
  logRowHeight,
  logsLength,
  logViewportRef,
  visibleLogs,
  onClose,
  onScroll,
}: LogModalProps) {
  return (
    <div className="modal-backdrop" role="presentation">
      <div className="modal logs-modal" aria-label={logMode === "gsplat" ? "Логи gsplat" : "Логи COLMAP"}>
        <header className="modal-header logs-header">
          <h2>{logMode === "gsplat" ? "Логи gsplat" : "Логи COLMAP"}</h2>
          <button className="ghost" type="button" onClick={onClose}>
            Закрыть
          </button>
        </header>
        <div
          ref={logViewportRef}
          className="log-viewport"
          onScroll={(event) => onScroll(event.currentTarget.scrollTop)}
        >
          <div style={{ height: logsLength * logRowHeight, position: "relative" }}>
            <div className="log-lines" style={{ transform: `translateY(${firstLogIndex * logRowHeight}px)` }}>
              {visibleLogs.map((line, index) => (
                <div className="log-line" key={`${firstLogIndex + index}-${line}`}>
                  {line}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
