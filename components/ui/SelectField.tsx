'use client';
import { useId } from 'react';
import type { SelectFieldProps } from '@/types';
export function SelectField({ label, id, children, ...props }: SelectFieldProps) { const generated = useId(); return <div className="space-y-2"><label className="block text-sm font-medium" htmlFor={id ?? generated}>{label}</label><select id={id ?? generated} className="field" {...props}>{children}</select></div>; }
