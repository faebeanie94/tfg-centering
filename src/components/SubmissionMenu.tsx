import { useState } from 'react';

interface SubmissionMenuProps {
  submissionName: string;
  onViewCards: () => void;
}

export function SubmissionMenu({ submissionName, onViewCards }: SubmissionMenuProps) {
  const [open, setOpen] = useState(false);

  return (
    <div className="submission-menu">
      <button
        type="button"
        className="btn btn-secondary btn-small submission-menu-trigger"
        onClick={() => setOpen(!open)}
      >
        {submissionName}
      </button>
      {open && (
        <div className="submission-menu-dropdown">
          <button
            type="button"
            className="submission-menu-item"
            onClick={() => {
              onViewCards();
              setOpen(false);
            }}
          >
            Cards
          </button>
        </div>
      )}
    </div>
  );
}
