import { Dialog, DialogContent } from "@/components/ui/dialog";
import { CheckCircle, Loader2, Circle } from "lucide-react";
import { useState, useEffect } from "react";

interface LoadingModalProps {
  isOpen: boolean;
}

const LOADING_STEPS = [
  "Parsing competitor names",
  "Fetching news and press releases", 
  "Analyzing funding data",
  "Processing social mentions",
  "Generating AI summary"
];

export default function LoadingModal({ isOpen }: LoadingModalProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    if (!isOpen) {
      setCurrentStep(0);
      setProgress(0);
      return;
    }

    const interval = setInterval(() => {
      setCurrentStep(prev => {
        if (prev < LOADING_STEPS.length - 1) {
          return prev + 1;
        }
        return prev;
      });
      
      setProgress(prev => {
        if (prev < 90) {
          return prev + 15;
        }
        return prev;
      });
    }, 8000); // 8 seconds per step

    return () => clearInterval(interval);
  }, [isOpen]);

  return (
    <Dialog open={isOpen}>
      <DialogContent className="sm:max-w-md" data-testid="modal-loading">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-primary/10 rounded-full mb-4">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">Analyzing Competitors</h3>
          <p className="text-muted-foreground mb-6">Gathering signals from multiple sources...</p>
          
          {/* Progress Steps */}
          <div className="space-y-3 text-left">
            {LOADING_STEPS.map((step, index) => (
              <div key={index} className="flex items-center" data-testid={`loading-step-${index}`}>
                {index < currentStep ? (
                  <CheckCircle className="w-5 h-5 text-green-600 mr-3" />
                ) : index === currentStep ? (
                  <Loader2 className="w-5 h-5 text-primary mr-3 animate-spin" />
                ) : (
                  <Circle className="w-5 h-5 text-muted-foreground mr-3" />
                )}
                <span className={`text-sm ${index <= currentStep ? 'text-foreground' : 'text-muted-foreground'}`}>
                  {step}
                </span>
              </div>
            ))}
          </div>
          
          <div className="mt-6">
            <div className="w-full bg-muted rounded-full h-2">
              <div 
                className="bg-primary h-2 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
                data-testid="progress-bar"
              ></div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">Estimated time: 30-60 seconds</p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
