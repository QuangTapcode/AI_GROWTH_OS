import React, { useState } from "react";
import styles from "../../AiContextTab.module.css";

interface AddServiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (service: {
    title: string;
    targetPersona: string;
    description: string;
  }) => void;
}

export function AddServiceModal({ isOpen, onClose, onAdd }: AddServiceModalProps) {
  const [title, setTitle] = useState("");
  const [targetPersona, setTargetPersona] = useState("");
  const [desc, setDesc] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd({
      title: title.trim(),
      targetPersona: targetPersona.trim(),
      description: desc.trim(),
    });
    setTitle("");
    setTargetPersona("");
    setDesc("");
  };

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>Add Service</h3>
          <button type="button" className={styles.modalCloseBtn} onClick={onClose}>
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className={styles.modalBody}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Service Title</label>
              <input
                type="text"
                required
                placeholder="e.g. Airport Transfer Concierge"
                className={styles.formInput}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Target Persona</label>
              <input
                type="text"
                placeholder="e.g. Arriving business travelers"
                className={styles.formInput}
                value={targetPersona}
                onChange={(e) => setTargetPersona(e.target.value)}
              />
            </div>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Description</label>
              <textarea
                rows={3}
                placeholder="Describe the service..."
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
              Add Service
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
