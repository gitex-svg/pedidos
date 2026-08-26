import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

export function getErpStatusConfig(status?: string | null) {
  if (!status) return { label: 'Sem Status', color: 'bg-muted text-muted-foreground border-transparent' };
  
  const s = status.toUpperCase();
  if (s.includes('ANÁLISE') || s.includes('ANALISE')) {
    return { label: 'Em Análise', color: 'bg-yellow-500/10 text-yellow-700 border-yellow-500/20 dark:text-yellow-400' };
  }
  if (s.includes('APROVADO')) {
    return { label: 'Aprovado', color: 'bg-blue-500/10 text-blue-700 border-blue-500/20 dark:text-blue-400' };
  }
  if (s.includes('FECHADO')) {
    return { label: 'Fechado', color: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20 dark:text-emerald-400' };
  }
  if (s.includes('FATURADO')) {
    return { label: 'Faturado', color: 'bg-purple-500/10 text-purple-700 border-purple-500/20 dark:text-purple-400' };
  }
  if (s.includes('REPROVADO')) {
    return { label: 'Reprovado', color: 'bg-red-500/10 text-red-700 border-red-500/20 dark:text-red-400' };
  }
  
  return { label: status, color: 'bg-secondary text-secondary-foreground border-border' };
}

interface ErpStatusBadgeProps {
  status?: string | null;
  className?: string;
}

export function ErpStatusBadge({ status, className }: ErpStatusBadgeProps) {
  if (!status) return null;
  const config = getErpStatusConfig(status);
  
  return (
    <Badge variant="outline" className={cn(config.color, className)}>
      {config.label}
    </Badge>
  );
}

interface DateDisplayProps {
  date?: string | null;
  label: string;
  className?: string;
}

export function ErpDateDisplay({ date, label, className }: DateDisplayProps) {
  if (!date) return null;
  
  return (
    <div className={cn("flex flex-col text-xs", className)}>
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">
        {format(new Date(date), "dd/MM/yy HH:mm", { locale: ptBR })}
      </span>
    </div>
  );
}
