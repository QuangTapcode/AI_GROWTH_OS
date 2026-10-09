import React, { useState } from "react";
import styles from "../../AiContextTab.module.css";

interface EditBrandModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialBrandVoice: string;
  initialTone: string;
  initialGuidelines: string;
  onSave: (data: {
    brandVoice: string;
    tone: string;
    guidelines: string;
    forbiddenTerm?: string;
  }) => void;
}

export function EditBrandModal({
  isOpen,
  onClose,
  initialBrandVoice,
  initialTone,
  initialGuidelines,
  onSave,
}: EditBrandModalProps) {
  const [brandVoice, setBrandVoice] = useState(initialBrandVoice);
  const [tone, setTone] = useState(initialTone);
  const [guidelines, setGuidelines] = useState(initialGuidelines);
  const [newForbiddenTerm, setNewForbiddenTerm] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      brandVoice: brandVoice.trim(),
      tone: tone.trim(),
      guidelines: guidelines.trim(),
      forbiddenTerm: newForbiddenTerm.trim() || undefined,
    });
    setNewForbiddenTerm("");
  };

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>Edit Brand Context</h3>
          <button type="button" className={styles.modalCloseBtn} onClick={onClose}>
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className={styles.modalBody}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Brand voice</label>
              <input
                type="text"
                required
                className={styles.formInput}
                value={brandVoice}
                onChange={(e) => setBrandVoice(e.target.value)}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Tone</label>
              <input
                type="text"
                required
                className={styles.formInput}
                value={tone}
                onChange={(e) => setTone(e.target.value)}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Brand guidelines</label>
              <textarea
                rows={3}
                required
                className={styles.formTextarea}
                value={guidelines}
                onChange={(e) => setGuidelines(e.target.value)}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Add Forbidden Term (Optional)</label>
              <input
                type="text"
                placeholder="e.g. Lowest Price"
                className={styles.formInput}
                value={newForbiddenTerm}
                onChange={(e) => setNewForbiddenTerm(e.target.value)}
              />
            </div>
          </div>
          <div className={styles.modalFooter}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={styles.submitBtn}>
              Save Brand Context
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
