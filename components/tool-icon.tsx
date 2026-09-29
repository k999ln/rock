'use client';

import {
  AudioLines, BarChart3, BookOpenCheck, BrainCircuit, CalendarDays,
  Clapperboard, ClipboardCheck, Compass, FileSpreadsheet, GitPullRequest,
  Globe, Inbox, LayoutTemplate, Lightbulb, ListChecks, MessageSquare,
  MessagesSquare, Monitor, MousePointer2, PackageCheck, Palette, PenLine,
  Radar, Receipt, Route, Scale, Search, Send, Shirt, ShoppingBag,
  Smartphone, Sparkles, TrendingUp, Users, Workflow,
  type LucideIcon,
} from 'lucide-react';

// One stable, task-specific symbol per catalog entry. Unknown IDs keep a neutral icon.
export const toolIcons: Record<string, LucideIcon> = {
  'rockstar-csv-cleanup': FileSpreadsheet,
  'rockstar-markets-analysis': BarChart3,
  'mercari-revenue': ShoppingBag,
  'fashion-brand-ops': Shirt,
  'rockstar-ip-studio': Palette,
  coconala: ClipboardCheck,
  'mr-free-article': PenLine,
  'mr-citations': BookOpenCheck,
  'mr-delivery': PackageCheck,
  'rockstar-ledger': Receipt,
  'jev-evaluation': Sparkles,
  'rockstar-legal-intake': Scale,
  'rockstar-patent-assistant': Lightbulb,
  'faster-whisper': AudioLines,
  'transformers-js': BrainCircuit,
  playwright: Globe,
  'jev-ultrafast': MousePointer2,
  'jev-trader': TrendingUp,
  'typesafe-computer-use': Monitor,
  'jev-review': GitPullRequest,
  'jev-router': Route,
  'jev-browser': Compass,
  'mobile-jev': Smartphone,
  'coconala-proposal-draft': MessageSquare,
  'gig-workflow': Workflow,
  'coconala-inbox': Inbox,
  'youtube-script-writer': Clapperboard,
  'seo-blueprint': Search,
  'landing-page-sprint': LayoutTemplate,
  'sales-objection-reply-builder': MessagesSquare,
  'user-interview-synthesizer': Users,
  'calendar-coordination': CalendarDays,
  'telegram-notifications': Send,
  'producthunt-discovery': Radar,
};

export function ToolIcon({ id, size = 24, className }: { id: string; size?: number; className?: string }) {
  const Icon = toolIcons[id] ?? ListChecks;
  return <Icon size={size} strokeWidth={1.9} className={className} aria-hidden="true" focusable="false" />;
}
