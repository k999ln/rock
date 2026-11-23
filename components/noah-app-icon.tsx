'use client';
import {
  AudioLines, Blocks, BookOpen, Boxes, BriefcaseBusiness, ChartNoAxesCombined,
  Clock3, Compass, Database, FilePenLine, Folder, GalleryVerticalEnd, GraduationCap,
  Landmark, Layers3, Leaf, Network, Presentation, ScanSearch, Terminal,
  type LucideIcon,
} from 'lucide-react';
import type { NoahPinTopic } from '@/lib/noah-pins';
import styles from './noah-app-icon.module.css';
import { useArtEntrance } from './noah-art-motion';

type Mark = readonly [LucideIcon, 'amber' | 'blue' | 'violet' | 'jade' | 'coral' | 'ink' | 'rose'];

// These are Noah's own capability illustrations for catalog entries without supplied artwork.
const topics: Record<NoahPinTopic, Mark> = {
  money: [Landmark, 'jade'],
  dev: [Terminal, 'ink'],
  research: [ScanSearch, 'blue'],
  work: [BriefcaseBusiness, 'blue'],
  learn: [GraduationCap, 'amber'],
  life: [Leaf, 'jade'],
  data: [Database, 'violet'],
  media: [AudioLines, 'rose'],
  words: [FilePenLine, 'coral'],
  other: [Blocks, 'violet'],
};
const catalog: ReadonlyMap<string, Mark> = new Map<string, Mark>([
  ['memory', [GalleryVerticalEnd, 'amber']],
  ['法人のsi導入準備', [Presentation, 'blue']],
  ['capital company', [ChartNoAxesCombined, 'jade']],
  ['capxule', [Boxes, 'violet']],
  ['filesystem', [Folder, 'coral']],
  ['time', [Clock3, 'ink']],
  ['sequentialthinking', [Network, 'blue']],
  ['hermes-agent', [Layers3, 'rose']],
  ['anicca', [Compass, 'coral']],
  ['wordpress-maintenance', [BookOpen, 'ink']],
  ['ec-production', [BriefcaseBusiness, 'jade']],
]);

export default function NoahAppIcon({ name, topic = 'other', className = '' }: {
  name: string;
  topic?: NoahPinTopic;
  className?: string;
}) {
  const ref = useArtEntrance();
  const [Icon, palette] = catalog.get(name.trim().toLowerCase()) ?? topics[topic] ?? topics.other;
  return <span ref={ref} data-noah-motion="icon" className={`${styles.icon} ${className}`} data-palette={palette} aria-hidden="true">
    <Icon strokeWidth={2.05} focusable="false" />
  </span>;
}
