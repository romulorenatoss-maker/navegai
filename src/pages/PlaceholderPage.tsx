import { construction } from "lucide-react";

interface PlaceholderPageProps {
  title: string;
  description: string;
}

export default function PlaceholderPage({ title, description }: PlaceholderPageProps) {
  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-section font-semibold text-foreground">{title}</h1>
        <p className="text-body text-muted-foreground">{description}</p>
      </div>
      <div className="bg-card border border-border rounded-lg shadow-card p-12 flex flex-col items-center justify-center text-center">
        <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
          <span className="text-section">🚧</span>
        </div>
        <p className="text-body font-medium text-foreground mb-1">Módulo em desenvolvimento</p>
        <p className="text-caption text-muted-foreground">Este módulo será implementado em breve.</p>
      </div>
    </div>
  );
}
