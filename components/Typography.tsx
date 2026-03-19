import React from 'react';

type TypographyVariant =
    | 'h1' | 'h2' | 'h3'
    | 'body' | 'body-sm'
    | 'label' | 'label-muted'
    | 'mono' | 'mono-sm';

interface TypographyProps {
    variant?: TypographyVariant;
    children: React.ReactNode;
    className?: string;
    as?: React.ElementType;
    uppercase?: boolean;
}

export const Typography: React.FC<TypographyProps> = ({
    variant = 'body',
    children,
    className = '',
    as: Component = 'div',
    uppercase = false
}) => {
    const variants: Record<TypographyVariant, string> = {
        'h1': 'font-heading text-4xl font-black tracking-tight leading-tight',
        'h2': 'font-heading text-3xl font-black tracking-tight leading-tight',
        'h3': 'font-heading text-2xl font-extrabold leading-tight',
        'body': 'font-sans text-base font-semibold',
        'body-sm': 'font-sans text-sm font-semibold',
        'label': 'font-sans text-xs font-black uppercase tracking-wider',
        'label-muted': 'font-sans text-xs font-bold uppercase tracking-wider opacity-85',
        'mono': 'font-mono text-sm font-bold',
        'mono-sm': 'font-mono text-xs font-bold'
    };

    // Không ép màu mặc định để Typography có thể kế thừa màu sắc từ parent (ví dụ: MetricCard)
    const combinedClasses = [
        variants[variant],
        uppercase ? 'uppercase' : '',
        className
    ].filter(Boolean).join(' ');

    return (
        <Component className={combinedClasses}>
            {children}
        </Component>
    );
};
