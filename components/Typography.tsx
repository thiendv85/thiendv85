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

export const Typography: React.FC<TypographyProps> = React.memo(({
    variant = 'body',
    children,
    className = '',
    as: Component = 'div',
    uppercase = false
}) => {
    const variants: Record<TypographyVariant, string> = {
        'h1': 'font-heading text-2xl font-black tracking-tight leading-tight',
        'h2': 'font-heading text-xl font-black tracking-tight leading-tight',
        'h3': 'font-heading text-lg font-extrabold leading-tight',
        'body': 'font-sans text-sm font-semibold',
        'body-sm': 'font-sans text-[13px] font-semibold',
        'label': 'font-sans text-[10px] font-black uppercase tracking-wider',
        'label-muted': 'font-sans text-[10px] font-bold uppercase tracking-wider opacity-85',
        'mono': 'font-mono text-xs font-bold',
        'mono-sm': 'font-mono text-[10px] font-bold'
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
});
