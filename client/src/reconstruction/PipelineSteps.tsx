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
          <span>{step.label}</span>
        </div>
      ))}
    </div>
  );
}
