import React, { useState } from "react";
import styles from "../../AiContextTab.module.css";

interface AddLocationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (name: string) => void;
}

export function AddLocationModal({ isOpen, onClose, onAdd }: AddLocationModalProps) {
  const [name, setName] = useState("");

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onAdd(name.trim());
    setName("");
  };

  return (
    <div className={styles.modalBackdrop} onClick={onClose}>
      <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <h3 className={styles.modalTitle}>Add Location</h3>
          <button type="button" className={styles.modalCloseBtn} onClick={onClose}>
            ✕
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className={styles.modalBody}>
            <div className={styles.formGroup}>
              <label className={styles.formLabel}>Location address or district</label>
              <input
                type="text"
                required
                placeholder="e.g. Da Nang, Hai Chau, Vietnam"
                className={styles.formInput}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>
          <div className={styles.modalFooter}>
            <button type="button" className={styles.cancelBtn} onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className={styles.submitBtn}>
              Add Location
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
