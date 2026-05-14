import styles from './StepIndicator.module.css';

const STEPS = ['Input', 'Verify', 'Configure'] as const;

interface Props {
  active: 1 | 2 | 3;
}

export default function StepIndicator({ active }: Props) {
  return (
    <div className={styles.bar}>
      {STEPS.map((label, i) => {
        const step = (i + 1) as 1 | 2 | 3;
        const isDone   = step < active;
        const isActive = step === active;
        return (
          <div key={label} className={styles.step}>
            <div
              className={
                styles.dot +
                (isActive ? ' ' + styles.dotActive : '') +
                (isDone   ? ' ' + styles.dotDone   : '')
              }
            >
              {isDone ? '✓' : step}
            </div>
            <span
              className={
                styles.label +
                (isActive ? ' ' + styles.labelActive : '') +
                (isDone   ? ' ' + styles.labelDone   : '')
              }
            >
              {label}
            </span>
            {i < STEPS.length - 1 && (
              <div className={styles.line + (isDone ? ' ' + styles.lineDone : '')} />
            )}
          </div>
        );
      })}
    </div>
  );
}
