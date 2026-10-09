import React, { useState } from "react";
import styles from "../../AiContextTab.module.css";

interface AddCompetitorModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (competitor: {
    name: string;
    url: string;
    description: string;
  }) => void;
}

export function AddCompetitorModal({
  isOpen,
  onClose,
  onAdd,
}: AddCompetitorModalProps) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [desc, setDesc] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd({
      name: name.trim(),
      url: url.trim() || `${name.trim().toLowerCase().replace(/\s+/g, "")}.com`,
      description: desc.trim() || "Travel market provider.",
    });
    setName("");
    setUrl("");
    setDesc("");
  };

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>Add Competitor</h3>
          <button type="button" className={styles.modalCloseBtn} onClick={onClose}>
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className={styles.modalBody}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Competitor name</label>
              <input
                type="text"
                required
                placeholder="e.g. GetYourGuide"
                className={styles.formInput}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Website URL</label>
              <input
                type="text"
                placeholder="e.g. getyourguide.com"
                className={styles.formInput}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Description</label>
              <textarea
                rows={2}
                placeholder="Brief description of their positioning..."
                className={styles.formTextarea}
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
              />
            </div>
          </div>
          <div className={styles.modalFooter}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={styles.submitBtn}>
              Add Competitor
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
