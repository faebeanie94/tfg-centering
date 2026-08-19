interface SubmissionToolbarProps {
  submissionName: string;
  onViewCards: () => void;
}

export function SubmissionToolbar({ submissionName, onViewCards }: SubmissionToolbarProps) {
  return (
    <div className="submission-toolbar">
      <div className="submission-toolbar-name">{submissionName}</div>
      <button type="button" className="btn btn-secondary btn-small" onClick={onViewCards}>
        Cards
      </button>
    </div>
  );
}
