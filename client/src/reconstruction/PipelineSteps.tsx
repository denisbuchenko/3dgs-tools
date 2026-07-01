import type { PipelineStep } from "../types";

type PipelineStepsProps = {
  steps: PipelineStep[];
};

export function PipelineSteps({ steps }: PipelineStepsProps) {
  return (
    <div className="pipeline">
      {steps.map((step) => (
        <div className={`pipeline-step ${step.status}`} key={step.id}>
          <span className="step-dot" />
          <div className="step-body">
            <div className="step-title-row">
              <span>{step.label}</span>
              {step.progress ? <strong>{step.progress.percent}%</strong> : null}
            </div>
            {step.progress ? (
              <>
                <div className="step-progress">
                  <span style={{ width: `${step.progress.percent}%` }} />
                </div>
                {step.progress.message ? <small>{step.progress.message}</small> : null}
              </>
            ) : null}
          </div>
        </div>
      ))}
    </div>
  );
}
