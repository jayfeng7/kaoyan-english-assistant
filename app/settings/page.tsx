import { PageContainer } from '@/components/layout/PageContainer';
import { PageIntro } from '@/components/layout/PageIntro';
import { SettingsForm } from '@/components/layout/SettingsForm';
import type { NextMetadata } from '@/types';

export const metadata: NextMetadata = { title: '设置' };

export default function SettingsPage() {
  return <PageContainer width="reading"><PageIntro eyebrow="Preferences" title="找到适合你的阅读方式" description="设置默认题型、大小作文与阅读字号，让练习更顺手。" /><SettingsForm /></PageContainer>;
}
