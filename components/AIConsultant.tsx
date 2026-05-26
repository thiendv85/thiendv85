import React from 'react';
import DOMPurify from 'dompurify';

import { FaIcon } from './Icon';
interface AIConsultantProps {
    isLoading: boolean;
    response: string | null;
    onAnalyze: () => void;
}

export const AIConsultant = ({ isLoading, response, onAnalyze }: AIConsultantProps) => {
    const isInitialState = !isLoading && !response;

    const getStatusText = () => {
        if (isInitialState) return 'Click to run analysis';
        if (isLoading) return 'Ready for deep thinking';
        return 'Analysis Complete';
    };

    const headerClasses = `
    bg-gradient-to-r from-emerald-50/60 to-white/60 p-4 rounded-full border border-emerald-200/50 shadow-lg
    flex items-center gap-5 transition-all duration-300
    ${isInitialState ? 'cursor-pointer hover:shadow-xl hover:scale-[1.01] transform' : ''}
  `;

    const renderFormattedResponse = (text: string) => {
        const lines = text.split('\n').filter(line => line.trim() !== '');
        const blocks: { type: string; lines: string[] }[] = [];
        let currentBlock: { type: string; lines: string[] } | null = null;

        lines.forEach(line => {
            const isHeader = /^[1-6]\.\s|🚦|🧠|🌊|🚀|💡/.test(line);
            const isListItem = /^[-*🔥🛠️🎯]\s/.test(line);
            const isTable = line.includes('|');
            let type = 'paragraph';
            if (isHeader) type = 'header';
            else if (isListItem) type = 'list';
            else if (isTable) type = 'table';

            if (currentBlock && currentBlock.type === type && type !== 'header') {
                currentBlock.lines.push(line);
            } else {
                if (currentBlock) blocks.push(currentBlock);
                currentBlock = { type, lines: [line] };
            }
        });
        if (currentBlock) blocks.push(currentBlock);

        const formatText = (content: string) => {
            let formatted = content.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-emerald-900">$1</strong>');
            formatted = formatted.replace(/(^|\s)(-\d+(\.\d+)?)/g, '$1<span class="text-rose-600 font-bold">$2</span>');
            return DOMPurify.sanitize(formatted, { ALLOWED_TAGS: ['strong', 'span'], ALLOWED_ATTR: ['class'] });
        };

        return blocks.map((block, bIdx) => {
            switch (block.type) {
                case 'header':
                    return block.lines.map((line, lIdx) => (
                        <h4
                            key={`h-${bIdx}-${lIdx}`}
                            className="font-black text-emerald-950 mt-6 mb-3 text-base flex items-center gap-2 border-b-2 border-emerald-100 pb-2 uppercase"
                            dangerouslySetInnerHTML={{ __html: formatText(line) }}
                        />
                    ));
                case 'list':
                    return (
                        <ul key={`l-${bIdx}`} className="space-y-2 my-3 ml-2">
                            {block.lines.map((line, lIdx) => {
                                const iconMatch = line.match(/^[-*🔥🛠️🎯]/);
                                const icon = iconMatch ? iconMatch[0] : '•';
                                const content = line.replace(/^[-*🔥🛠️🎯]\s*/, '');
                                return (
                                    <li
                                        key={lIdx}
                                        className="flex items-start gap-3 bg-white/50 p-1.5 rounded-lg border border-transparent hover:border-emerald-100 transition-colors"
                                    >
                                        <span className="text-lg">{icon}</span>
                                        <p
                                            className="flex-1 leading-relaxed text-sm"
                                            dangerouslySetInnerHTML={{ __html: formatText(content) }}
                                        />
                                    </li>
                                );
                            })}
                        </ul>
                    );
                case 'table':
                    const rows = block.lines
                        .filter(l => !l.includes('---'))
                        .map(l =>
                            l
                                .split('|')
                                .filter(cell => cell.trim() !== '')
                                .map(cell => cell.trim()),
                        );
                    if (rows.length === 0) return null;
                    const [thead, ...tbody] = rows;
                    return (
                        <div
                            key={`t-${bIdx}`}
                            className="my-4 overflow-hidden border border-emerald-200 rounded-xl shadow-sm"
                        >
                            <table className="w-full text-left border-collapse">
                                <thead className="bg-emerald-600 text-white">
                                    <tr>
                                        {thead.map((cell, i) => (
                                            <th
                                                key={i}
                                                className="p-2 text-xs uppercase font-black"
                                                dangerouslySetInnerHTML={{ __html: formatText(cell) }}
                                            />
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="bg-white">
                                    {tbody.map((row, i) => (
                                        <tr
                                            key={i}
                                            className="border-t border-emerald-100 hover:bg-emerald-50/50 transition-colors"
                                        >
                                            {row.map((cell, j) => (
                                                <td
                                                    key={j}
                                                    className="p-2 text-xs"
                                                    dangerouslySetInnerHTML={{ __html: formatText(cell) }}
                                                />
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    );
                default:
                    return block.lines.map((line, lIdx) => (
                        <p
                            key={`p-${bIdx}-${lIdx}`}
                            className="mb-2 text-gray-700 leading-relaxed text-sm"
                            dangerouslySetInnerHTML={{ __html: formatText(line) }}
                        />
                    ));
            }
        });
    };

    return (
        <div className="bg-gradient-to-br from-emerald-50 to-white rounded-[40px] p-6 border border-emerald-100 shadow-xl mt-4">
            <div
                className={headerClasses}
                onClick={isInitialState ? onAnalyze : undefined}
                aria-label={isInitialState ? 'Start AI Analysis' : 'AI Analysis Status'}
                role={isInitialState ? 'button' : 'status'}
                tabIndex={isInitialState ? 0 : -1}
                onKeyDown={isInitialState ? e => (e.key === 'Enter' || e.key === ' ') && onAnalyze() : undefined}
            >
                <div className="w-12 h-12 bg-emerald-800 text-white rounded-full flex-shrink-0 flex items-center justify-center shadow-lg">
                    <FaIcon className="fas fa-brain text-lg" />
                </div>
                <div className="flex-1">
                    <h4 className="text-emerald-950 font-black text-sm tracking-widest uppercase">
                        AI Expert Analysis
                    </h4>
                    <div className="flex items-center gap-2 mt-1">
                        <span
                            className={`relative inline-flex rounded-full h-2 w-2 ${isLoading ? 'bg-emerald-500' : isInitialState ? 'bg-slate-500' : 'bg-green-500'}`}
                        ></span>
                        <p className="text-emerald-600 text-2xs font-bold uppercase tracking-[0.2em]">
                            {getStatusText()}
                        </p>
                    </div>
                </div>
                {isInitialState && (
                    <div className="pr-4">
                        <div className="w-10 h-10 rounded-full bg-white/50 flex items-center justify-center">
                            <FaIcon className="fas fa-play text-emerald-700" />
                        </div>
                    </div>
                )}
            </div>

            {isLoading && (
                <div className="text-center p-10 bg-white/50 rounded-2xl border border-emerald-100 border-dashed mt-6">
                    <FaIcon className="fas fa-circle-notch animate-spin text-3xl text-emerald-500" />
                    <p className="mt-4 font-bold text-emerald-700">AI đang tư duy sâu...</p>
                    <p className="text-xs text-emerald-600">Vui lòng đợi trong giây lát.</p>
                </div>
            )}

            {response && (
                <div className="bg-white/80 backdrop-blur-sm p-6 rounded-[28px] border border-white shadow-inner text-gray-800 animate-in fade-in slide-in-from-bottom-4 duration-700 mt-6">
                    <div className="prose prose-emerald max-w-none">{renderFormattedResponse(response)}</div>
                    <div className="mt-6 pt-4 border-t border-dashed border-emerald-200 flex justify-end">
                        <button
                            onClick={() => navigator.clipboard.writeText(response)}
                            className="text-emerald-600 font-bold text-2xs uppercase flex items-center gap-2 hover:text-emerald-800 transition-colors"
                        >
                            <FaIcon className="far fa-copy" /> Sao chép báo cáo
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
