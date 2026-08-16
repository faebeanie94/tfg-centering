import { formatMm, formatPct, type CenteringResult } from '../lib/centering';
import { formatGrade } from '../lib/session';
import type { CardSide, TfgCenteringGrade } from '../lib/tfg-standards';
import './CardGradeResult.css';

export type CardGradeResultData = {
  side: CardSide;
  grade: TfgCenteringGrade;
  measurements: CenteringResult;
  imageUrl: string;
};

type Props = {
  result: CardGradeResultData;
  onRetake: () => void;
  onConfirm: () => void;
};

export default function CardGradeResult({ result, onRetake, onConfirm }: Props) {
  const { grade, measurements, imageUrl, side } = result;

  return (
    <div className="card-result">
      <div className="card-result__container">
        <div className="card-result__header">
          <h1>Card Grade</h1>
          <p>
            Review the {side} centering estimate before confirming. You can still adjust the
            border lines after confirm.
          </p>
        </div>

        <div className="card-result__image-wrapper">
          <img src={imageUrl} alt={`${side} trading card`} className="card-result__image" />
        </div>

        <div className="card-result__grade">
          <span className="card-result__grade-label">{grade.label}</span>
          <span className="card-result__grade-value">{formatGrade(grade.grade)}</span>
          <span className="card-result__grade-band">{grade.ratioLabel} band</span>
        </div>

        <div className="card-result__section">
          <h2>Centering</h2>
          <div className="card-result__measurements">
            <Measurement
              label="Horizontal L | R"
              pair={`${formatPct(measurements.leftRight.left)} | ${formatPct(measurements.leftRight.right)}`}
              ratio={`${Math.round(measurements.leftRight.left)}/${Math.round(measurements.leftRight.right)}`}
            />
            <Measurement
              label="Vertical T | B"
              pair={`${formatPct(measurements.topBottom.top)} | ${formatPct(measurements.topBottom.bottom)}`}
              ratio={`${Math.round(measurements.topBottom.top)}/${Math.round(measurements.topBottom.bottom)}`}
            />
          </div>
        </div>

        <div className="card-result__section">
          <h2>Border widths</h2>
          <div className="card-result__details">
            <Detail label="Left" value={formatMm(measurements.bordersMm.left)} />
            <Detail label="Right" value={formatMm(measurements.bordersMm.right)} />
            <Detail label="Top" value={formatMm(measurements.bordersMm.top)} />
            <Detail label="Bottom" value={formatMm(measurements.bordersMm.bottom)} />
          </div>
        </div>

        <div className="card-result__actions">
          <button type="button" className="card-result__retake" onClick={onRetake}>
            Retake
          </button>
          <button type="button" className="card-result__confirm" onClick={onConfirm}>
            Confirm Grade
          </button>
        </div>
      </div>
    </div>
  );
}

function Measurement({ label, pair, ratio }: { label: string; pair: string; ratio: string }) {
  return (
    <div className="measurement">
      <span className="measurement__label">{label}</span>
      <span className="measurement__value">{ratio}</span>
      <span className="measurement__pair">{pair}</span>
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail">
      <span className="detail__label">{label}</span>
      <span className="detail__value">{value}</span>
    </div>
  );
}
