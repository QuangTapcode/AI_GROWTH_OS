import React, { useState } from "react";
import styles from "../../AiContextTab.module.css";

interface EditBusinessModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialIndustry: string;
  initialOverview: string;
  onSave: (industry: string, overview: string) => void;
}

export function EditBusinessModal({
  isOpen,
  onClose,
  initialIndustry,
  initialOverview,
  onSave,
}: EditBusinessModalProps) {
  const [industry, setIndustry] = useState(initialIndustry);
  const [overview, setOverview] = useState(initialOverview);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(industry, overview);
  };

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>Edit Business Context</h3>
          <button type="button" className={styles.modalCloseBtn} onClick={onClose}>
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className={styles.modalBody}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Industry</label>
              <input
                type="text"
                required
                className={styles.formInput}
                value={industry}
                onChange={(e) => setIndustry(e.target.value)}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Business overview</label>
              <textarea
                rows={4}
                required
                className={styles.formTextarea}
                value={overview}
                onChange={(e) => setOverview(e.target.value)}
              />
            </div>
          </div>
          <div className={styles.modalFooter}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={styles.submitBtn}>
              Save changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
