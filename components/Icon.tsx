import React from 'react';
import {
    AlertCircle, AlertTriangle, Archive, ArrowDown, ArrowDownWideNarrow, ArrowLeft,
    ArrowLeftRight, ArrowRight, ArrowRightLeft, ArrowUp, Award, Ban, BarChart3, Battery,
    BatteryLow, Bell, Bolt, BookOpen, Bookmark, Box, Boxes, Brain, BrainCircuit,
    Building2, CalendarCheck, CalendarDays, CalendarMinus, Car, ChartLine,
    ChartPie, Check, CheckCheck, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight,
    ChevronUp, CircleAlert, CircleCheck, CircleDollarSign, CircleDot, CircleX,
    ClipboardCheck, Clock, Cloud, CloudDownload, CloudUpload, Coins, Copy, Cpu,
    Database, Download, Edit3, Eraser, Eye, FileDown, FileSignature,
    FileSpreadsheet, FileText, FileUp, Filter, Flame, FlaskConical, FolderOpen,
    GitBranch, Grid3x3, Hand, HandCoins, History, Hourglass, Inbox, Info, Key,
    Layers, Lightbulb, Link, ListChecks, Loader2, Lock, LockOpen, LogIn, Mail,
    MessageSquare, MessageCircle, Microchip, Minus, MoreVertical, Network,
    PackageOpen, Palette, PenLine, PenTool, Pencil, Plane,
    PlaneTakeoff, Play, Plus, PlusCircle, Power, Printer, Quote, Radiation,
    Repeat, RotateCcw, Save, Scissors, Search, SearchCheck, Send, Server, Settings,
    Shield, ShieldCheck, Ship, ShoppingCart, Shuffle, SlidersHorizontal,
    SortAsc, SpellCheck, Sparkles, Square, Store, Table, TableProperties, Trash2,
    TrendingDown, TrendingUp, Truck, Undo, Upload, User, UserPen, UserPlus, Users,
    Wallet, Wand2, Warehouse, Waves, Workflow, X,
    type LucideIcon,
} from 'lucide-react';

// ─── Mapping fa-X → Lucide component ────────────────────────────────────────
// Comprehensive mapping for the ~165 fa- icons used across V16. Unmapped names
// fall back to <CircleAlert /> so missing icons are visually obvious.
const FA_TO_LUCIDE: Record<string, LucideIcon> = {
    'arrow-down': ArrowDown,
    'arrow-down-wide-short': ArrowDownWideNarrow,
    'arrow-left': ArrowLeft,
    'arrow-right': ArrowRight,
    'arrow-right-to-bracket': LogIn,
    'arrow-rotate-left': RotateCcw,
    'arrow-trend-down': TrendingDown,
    'arrow-trend-up': TrendingUp,
    'arrow-up': ArrowUp,
    'arrows-left-right': ArrowLeftRight,
    'arrows-rotate': Repeat,
    'balance-scale': Award,
    'ban': Ban,
    'battery-empty': BatteryLow,
    'battery-quarter': Battery,
    'bell': Bell,
    'bolt': Bolt,
    'book-open': BookOpen,
    'bookmark': Bookmark,
    'box': Box,
    'box-archive': Archive,
    'box-open': PackageOpen,
    'boxes-packing': Boxes,
    'boxes-stacked': Boxes,
    'brain': Brain,
    'broom': Eraser,
    'building': Building2,
    'bullhorn': Bell,
    'bullseye': CircleDot,
    'calculator': Square,
    'calendar-alt': CalendarDays,
    'calendar-check': CalendarCheck,
    'calendar-circle-minus': CalendarMinus,
    'calendar-days': CalendarDays,
    'car': Car,
    'caret-down': ChevronDown,
    'caret-right': ChevronRight,
    'caret-up': ChevronUp,
    'cart-flatbed': Truck,
    'cart-flatbed-boxes': Truck,
    'cart-plus': PlusCircle,
    'cart-shopping': ShoppingCart,
    'chart-bar': BarChart3,
    'chart-line': ChartLine,
    'chart-pie': ChartPie,
    'chart-simple': BarChart3,
    'check': Check,
    'check-circle': CheckCircle2,
    'check-double': CheckCheck,
    'chevron-down': ChevronDown,
    'chevron-left': ChevronLeft,
    'chevron-right': ChevronRight,
    'circle-check': CircleCheck,
    'circle-dollar-to-slot': CircleDollarSign,
    'circle-dot': CircleDot,
    'circle-exclamation': CircleAlert,
    'circle-info': Info,
    'circle-notch': Loader2,
    'circle-xmark': CircleX,
    'clipboard-check': ClipboardCheck,
    'clock': Clock,
    'clock-rotate-left': History,
    'cloud': Cloud,
    'cloud-arrow-down': CloudDownload,
    'cloud-arrow-up': CloudUpload,
    'cloud-upload-alt': CloudUpload,
    'code-branch': GitBranch,
    'coins': Coins,
    'comment': MessageCircle,
    'comment-dots': MessageSquare,
    'copy': Copy,
    'cubes': Boxes,
    'database': Database,
    'diagram-project': Workflow,
    'display': Square,
    'download': Download,
    'ellipsis-v': MoreVertical,
    'envelope': Mail,
    'exchange-alt': ArrowRightLeft,
    'exclamation': AlertTriangle,
    'exclamation-circle': AlertCircle,
    'exclamation-triangle': AlertTriangle,
    'external-link-alt': Link,
    'eye': Eye,
    'file-arrow-down': FileDown,
    'file-csv': FileSpreadsheet,
    'file-excel': FileSpreadsheet,
    'file-export': FileUp,
    'file-import': FileDown,
    'file-invoice': FileText,
    'file-pen': Edit3,
    'file-signature': FileSignature,
    'filter': Filter,
    'fire': Flame,
    'flask': FlaskConical,
    'floppy-disk': Save,
    'folder-open': FolderOpen,
    'gear': Settings,
    'grid-horizontal': Grid3x3,
    'hand': Hand,
    'hand-holding-dollar': HandCoins,
    'history': History,
    'hourglass-half': Hourglass,
    'icons': Sparkles,
    'inbox': Inbox,
    'info-circle': Info,
    'key': Key,
    'layer-group': Layers,
    'lightbulb': Lightbulb,
    'link': Link,
    'list-check': ListChecks,
    'lock': Lock,
    'lock-open': LockOpen,
    'long-arrow-alt-right': ArrowRight,
    'magic': Wand2,
    'magnifying-glass': Search,
    'magnifying-glass-chart': SearchCheck,
    'microchip': Microchip,
    'microchip-ai': BrainCircuit,
    'minus': Minus,
    'palette': Palette,
    'paper-plane': Send,
    'pen': Pencil,
    'pen-nib': PenTool,
    'pen-to-square': PenLine,
    'pencil': Pencil,
    'plane': Plane,
    'plane-departure': PlaneTakeoff,
    'plane-slash': Plane,
    'plane-up': PlaneTakeoff,
    'play': Play,
    'plus': Plus,
    'plus-circle': PlusCircle,
    'power-off': Power,
    'print': Printer,
    'quote-left': Quote,
    'radiation': Radiation,
    'right-left': ArrowRightLeft,
    'robot': Cpu,
    'rotate-left': RotateCcw,
    'scissors': Scissors,
    'search': Search,
    'server': Server,
    'shield': Shield,
    'shield-check': ShieldCheck,
    'shield-halved': ShieldCheck,
    'ship': Ship,
    'shipping-fast': Truck,
    'shuffle': Shuffle,
    'sitemap': Network,
    'sliders': SlidersHorizontal,
    'sliders-h': SlidersHorizontal,
    'sort-amount-down': SortAsc,
    'spell-check': SpellCheck,
    'spinner': Loader2,
    'store': Store,
    'sync': Repeat,
    'sync-alt': Repeat,
    'table-cells': Table,
    'table-columns': TableProperties,
    'table-list': Table,
    'times': X,
    'trash': Trash2,
    'trash-alt': Trash2,
    'trash-can': Trash2,
    'triangle-exclamation': AlertTriangle,
    'truck': Truck,
    'truck-fast': Truck,
    'truck-loading': Truck,
    'truck-medical': Truck,
    'undo': Undo,
    'upload': Upload,
    'user': User,
    'user-pen': UserPen,
    'user-plus': UserPlus,
    'users': Users,
    'wallet': Wallet,
    'wand-magic-sparkles': Sparkles,
    'warehouse': Warehouse,
    'wave-square': Waves,
    'xmark': X,
};

const SIZE_FROM_TEXT: Record<string, number> = {
    'text-[7px]': 7,
    'text-[8px]': 8,
    'text-[9px]': 9,
    'text-[10px]': 10,
    'text-[11px]': 11,
    'text-xs': 12,
    'text-sm': 14,
    'text-base': 16,
    'text-lg': 18,
    'text-xl': 20,
    'text-2xl': 24,
    'text-3xl': 30,
    'text-4xl': 36,
    'text-5xl': 48,
    'text-6xl': 60,
    'text-7xl': 72,
};

interface FaIconProps {
    className?: string;
    size?: number;
    title?: string;
    onClick?: React.MouseEventHandler<SVGSVGElement>;
    style?: React.CSSProperties;
}

/**
 * Drop-in replacement for `<i className="fas fa-X ..." />` markup.
 *
 * Parses className to find:
 *   - `fa-X` token → corresponding lucide-react component
 *   - `fa-spin` / `fa-spinner` → animate-spin class
 *   - `text-Xxl` or `text-[Npx]` → SVG size in px (defaults to 16)
 *
 * The remaining className tokens (color/spacing/etc.) pass through. Color
 * works because lucide icons use `currentColor` for stroke.
 */
export const FaIcon: React.FC<FaIconProps> = ({
    className = '',
    size,
    title,
    onClick,
    style,
}) => {
    const tokens = className.split(/\s+/).filter(Boolean);
    const isSpinning = tokens.some(t => t === 'fa-spin');
    const iconToken =
        tokens.find(t => t.startsWith('fa-') && t !== 'fa-spin') ??
        tokens[0] ??
        '';
    const key = iconToken.replace(/^fa-/, '');
    const Component = FA_TO_LUCIDE[key] ?? CircleAlert;

    let detectedSize = 16;
    for (const cls of tokens) {
        const explicit = SIZE_FROM_TEXT[cls];
        if (explicit !== undefined) {
            detectedSize = explicit;
            break;
        }
        const px = cls.match(/^text-\[(\d+)px\]$/);
        if (px) {
            detectedSize = Number(px[1]);
            break;
        }
    }
    const finalSize = size ?? detectedSize;

    // Strip FA-specific and size classes; keep the rest (color, margin, etc.)
    const passthrough = tokens
        .filter(
            t =>
                !t.startsWith('fa-') &&
                t !== 'fas' &&
                t !== 'far' &&
                t !== 'fal' &&
                t !== 'fab' &&
                !(t in SIZE_FROM_TEXT) &&
                !/^text-\[\d+px\]$/.test(t),
        )
        .join(' ');
    const finalClassName = [passthrough, isSpinning ? 'animate-spin' : '']
        .filter(Boolean)
        .join(' ');

    return (
        <Component
            className={finalClassName || undefined}
            size={finalSize}
            aria-label={title}
            onClick={onClick}
            style={style}
        />
    );
};

export default FaIcon;
