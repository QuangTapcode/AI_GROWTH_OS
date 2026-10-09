import React, { useState } from "react";
import styles from "../../AiContextTab.module.css";

interface AddAudienceModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTitle: string;
  initialDemographics: string;
  onSave: (data: {
    title: string;
    demographics: string;
    painPoint?: string;
    interest?: string;
  }) => void;
}

export function AddAudienceModal({
  isOpen,
  onClose,
  initialTitle,
  initialDemographics,
  onSave,
}: AddAudienceModalProps) {
  const [title, setTitle] = useState(initialTitle);
  const [demographics, setDemographics] = useState(initialDemographics);
  const [painPoint, setPainPoint] = useState("");
  const [interest, setInterest] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      title: title.trim(),
      demographics: demographics.trim(),
      painPoint: painPoint.trim() || undefined,
      interest: interest.trim() || undefined,
    });
    setPainPoint("");
    setInterest("");
  };

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>Edit Target Audience</h3>
          <button type="button" className={styles.modalCloseBtn} onClick={onClose}>
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className={styles.modalBody}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Audience Segment</label>
              <input
                type="text"
                required
                className={styles.formInput}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Demographics</label>
              <input
                type="text"
                required
                className={styles.formInput}
                value={demographics}
                onChange={(e) => setDemographics(e.target.value)}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Add Pain Point (Optional)</label>
              <input
                type="text"
                placeholder="e.g. Difficulty finding English support"
                className={styles.formInput}
                value={painPoint}
                onChange={(e) => setPainPoint(e.target.value)}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Add Interest (Optional)</label>
              <input
                type="text"
                placeholder="e.g. Scuba diving, Coffee shops"
                className={styles.formInput}
                value={interest}
                onChange={(e) => setInterest(e.target.value)}
              />
            </div>
          </div>
          <div className={styles.modalFooter}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={styles.submitBtn}>
              Save Audience
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
