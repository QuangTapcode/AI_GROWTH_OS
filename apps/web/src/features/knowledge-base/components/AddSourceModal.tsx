"use client";

import React, { useState, useRef } from "react";
import type { SourceType, SourceCategory, NewSourcePayload } from "../types";
import { CATEGORY_OPTIONS } from "../constants";
import styles from "../KnowledgeBaseView.module.css";

interface AddSourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddSource: (payload: NewSourcePayload) => void;
}

export function AddSourceModal({
  isOpen,
  onClose,
  onAddSource,
}: AddSourceModalProps) {
  const [sourceTitle, setSourceTitle] = useState("TripC company overview");
  const [sourceType, setSourceType] = useState<SourceType>("PDF");
  const [sourceCategory, setSourceCategory] = useState<SourceCategory>("Company");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      setUploadedFileName(file.name);
      if (!sourceTitle || sourceTitle === "TripC company overview") {
        setSourceTitle(file.name.replace(/\.[^/.]+$/, ""));
      }
    }
  };

  const handleFileDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      setUploadedFileName(file.name);
      if (!sourceTitle || sourceTitle === "TripC company overview") {
        setSourceTitle(file.name.replace(/\.[^/.]+$/, ""));
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAddSource({
      title: sourceTitle,
      type: sourceType,
      category: sourceCategory,
      url: sourceUrl,
      text: sourceText,
      fileName: uploadedFileName,
    });
    // Reset form
    setSourceTitle("TripC company overview");
    setSourceType("PDF");
    setSourceCategory("Company");
    setSourceUrl("");
    setSourceText("");
    setUploadedFileName(null);
    onClose();
  };

  return (
    <div className={styles.modalBackdrop} onClick={onClose} role="dialog" aria-modal="true">
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className={styles.modalHeader}>
          <div className={styles.modalTitleBlock}>
            <h3 className={styles.modalTitle}>Add source</h3>
            <p className={styles.modalSubtitle}>
              Import a business source for AI retrieval.
            </p>
          </div>
          <button
            type="button"
            className={styles.modalCloseBtn}
            onClick={onClose}
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit}>
          <div className={styles.modalBody}>
            {/* Source type selector */}
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Source type</label>
              <div className={styles.sourceTypeToggle}>
                <button
                  type="button"
                  className={`${styles.sourceTypeBtn} ${
                    sourceType === "Text" ? styles.sourceTypeBtnActive : ""
                  }`}
                  onClick={() => setSourceType("Text")}
                >
                  Text
                </button>
                <button
                  type="button"
                  className={`${styles.sourceTypeBtn} ${
                    sourceType === "PDF" ? styles.sourceTypeBtnActive : ""
                  }`}
                  onClick={() => setSourceType("PDF")}
                >
                  PDF
                </button>
                <button
                  type="button"
                  className={`${styles.sourceTypeBtn} ${
                    sourceType === "URL" ? styles.sourceTypeBtnActive : ""
                  }`}
                  onClick={() => setSourceType("URL")}
                >
                  URL
                </button>
              </div>
            </div>

            {/* Title */}
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Title</label>
              <input
                type="text"
                required
                className={styles.formInput}
                placeholder="TripC company overview"
                value={sourceTitle}
                onChange={(e) => setSourceTitle(e.target.value)}
              />
            </div>

            {/* Category */}
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Category</label>
              <div className={styles.categorySelectWrap}>
                <select
                  className={styles.categorySelect}
                  value={sourceCategory}
                  onChange={(e) => setSourceCategory(e.target.value as SourceCategory)}
                >
                  {CATEGORY_OPTIONS.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                <span className={styles.categoryChevron}>
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </span>
              </div>
            </div>

            {/* Upload Area depending on source type */}
            {sourceType === "PDF" && (
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Upload PDF</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  style={{ display: "none" }}
                  onChange={handleFileChange}
                />
                <div
                  className={styles.dropzoneBox}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={handleFileDrop}
                  role="button"
                  tabIndex={0}
                >
                  <div className={styles.dropzoneIcon}>
                    <svg
                      width="28"
                      height="28"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#3b82f6"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M17.5 19H9a7 7 0 1 1 6.71-9h1.79a4.5 4.5 0 1 1 0 9Z" />
                      <polyline points="9 13 12 10 15 13" />
                      <line x1="12" y1="10" x2="12" y2="16" />
                    </svg>
                  </div>
                  <p className={styles.dropzoneTitle}>
                    Drop a PDF here or browse files
                  </p>
                  <p className={styles.dropzoneSub}>
                    Upload a PDF with a readable text layer for RAG processing.
                  </p>
                  {uploadedFileName && (
                    <div className={styles.fileChosenBadge}>
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                      >
                        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                        <polyline points="14 2 14 8 20 8" />
                      </svg>
                      <span>{uploadedFileName}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {sourceType === "URL" && (
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Website URL</label>
                <input
                  type="url"
                  required
                  className={styles.formInput}
                  placeholder="https://tripc.vn/about"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                />
              </div>
            )}

            {sourceType === "Text" && (
              <div className={styles.formGroup}>
                <label className={styles.formLabel}>Content / Markdown</label>
                <textarea
                  rows={4}
                  required
                  className={styles.formTextarea}
                  placeholder="Paste plain text, documentation or notes here..."
                  value={sourceText}
                  onChange={(e) => setSourceText(e.target.value)}
                />
              </div>
            )}
          </div>

          {/* Footer */}
          <div className={styles.modalFooter}>
            <button
              type="button"
              className={styles.cancelBtn}
              onClick={onClose}
            >
              Cancel
            </button>
            <button type="submit" className={styles.submitBtn}>
              Add source
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
