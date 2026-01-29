'use client';

import { Package, Download, ChevronDown, ExternalLink, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
	Collapsible,
	CollapsibleContent,
	CollapsibleTrigger,
} from '@/components/ui/collapsible';
import type { CurseForgeMod, ModtaleMod, SelectedMod, FileIndex, ModtaleVersion, ModProvider } from './types';

interface ModCardProps {
	mod: CurseForgeMod | ModtaleMod | SelectedMod;
	provider: ModProvider;
	isSelected: boolean;
	selectedVersion?: string | number; // fileId for CF, semver for Modtale
	isExpanded: boolean;
	isLoadingVersions?: boolean;
	onToggleExpand: (expanded: boolean) => void;
	onSelectVersion: (version?: string | number, fileName?: string) => void;
	onRemove: () => void;
}

export function ModCard({
	mod,
	provider,
	isSelected,
	selectedVersion,
	isExpanded,
	isLoadingVersions = false,
	onToggleExpand,
	onSelectVersion,
	onRemove,
}: ModCardProps) {
	const modtaleSlug = (name: string, id: string | number) => {
		const base = name
			.toLowerCase()
			.trim()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/-+/g, '-')
			.replace(/^-|-$/g, '');
		return `${base}-${id}`;
	};

	const modUrl =
		provider === 'curseforge'
			? (mod as CurseForgeMod).links?.websiteUrl || `https://www.curseforge.com/hytale/mods/${mod.slug}`
			: `https://modtale.net/mod/${modtaleSlug(mod.name, mod.id)}`;

	const imageUrl =
		'logo' in mod ? mod.logo?.thumbnailUrl : 'imageUrl' in mod ? mod.imageUrl : undefined;

	const providerLabel = provider === 'curseforge' ? 'CurseForge' : 'Modtale';

	return (
		<Collapsible open={isExpanded} onOpenChange={onToggleExpand}>
			<div
				className={`rounded-lg border transition-colors ${
					isSelected ? 'bg-primary/5 border-primary/30' : 'hover:bg-muted/50'
				}`}
			>
				<CollapsibleTrigger asChild>
					<button className="w-full flex items-center gap-3 p-3 text-left">
						{imageUrl ? (
							<img
								src={imageUrl}
								alt={mod.name}
								className="w-12 h-12 rounded-lg object-cover shrink-0"
							/>
						) : (
							<div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center shrink-0">
								<Package className="w-6 h-6 text-muted-foreground" />
							</div>
						)}
						<div className="flex-1 min-w-0">
							<div className="flex items-center gap-2">
								<h4 className="font-medium text-sm truncate group-hover:underline">
									{mod.name}
								</h4>
								{isSelected && (
									<Badge variant="default" className="text-xs px-1.5 py-0">
										{selectedVersion ? `v${selectedVersion}` : 'auto'}
									</Badge>
								)}
							</div>
							<p className="text-xs text-muted-foreground line-clamp-1 mt-0.5">
								{mod.summary}
							</p>
							<div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
								<span className="flex items-center gap-1">
									<Download className="w-3 h-3" />
									{('downloadCount' in mod ? mod.downloadCount : 'downloads' in mod ? mod.downloads : 0).toLocaleString()}
								</span>
								{'authors' in mod && mod.authors && mod.authors[0]?.url ? (
									<a
										href={mod.authors[0].url}
										target="_blank"
										rel="noopener noreferrer"
										onClick={(e) => e.stopPropagation()}
										className="flex items-center gap-1 text-muted-foreground hover:text-foreground hover:underline"
									>
										by {mod.authors[0].name}
									</a>
								) : 'authors' in mod && mod.authors && mod.authors[0] ? (
									<span>by {mod.authors[0].name}</span>
								) : null}
							</div>
						</div>
						<ChevronDown
							className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${
								isExpanded ? 'rotate-180' : ''
							}`}
						/>
					</button>
				</CollapsibleTrigger>

				<CollapsibleContent>
					<div className="flex flex-col pb-3 border-t">
						<div className="flex items-center gap-4 py-2 px-3 text-xs border-b mb-2">
							<a
								href={modUrl}
								target="_blank"
								rel="noopener noreferrer"
								onClick={(e) => e.stopPropagation()}
								className="flex items-center gap-1 text-primary hover:underline"
							>
								<ExternalLink className="w-3 h-3" />
								View on {providerLabel}
							</a>
						</div>

						<div className="px-3">
							<p className="text-xs text-start text-muted-foreground mb-2">
								Select a version:
							</p>
							{isLoadingVersions ? (
								<div className="flex items-center justify-center py-8">
									<Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
								</div>
							) : (
								<div className="space-y-1">
									<Button
										variant={isSelected && !selectedVersion ? 'default' : 'outline'}
										size="sm"
										className="w-full text-xs justify-between"
										onClick={() => {
											if (isSelected && !selectedVersion) {
												onRemove();
											} else if (isSelected) {
												onSelectVersion();
											} else {
												onSelectVersion();
											}
										}}
									>
										<span>Use Latest Version</span> (auto-update)
									</Button>

									{provider === 'curseforge' && 'latestFiles' in mod
										? mod.latestFiles?.slice(0, 10).map((file) => {
												const isThisVersion = selectedVersion === file.id;
												// For .zip files, use displayName, otherwise use fileName
												const displayText = file.fileName.endsWith('.zip')
													? file.displayName
													: file.fileName;
												return (
													<Button
														key={file.id}
														variant={isThisVersion ? 'default' : 'outline'}
														size="sm"
														className="w-full text-xs justify-start"
														onClick={() => {
															if (isThisVersion) {
																onRemove();
															} else {
																onSelectVersion(file.id, file.fileName);
															}
														}}
													>
														<span className="truncate">{displayText}</span>
													</Button>
												);
										  })
										: provider === 'modtale' && 'versions' in mod
										? mod.versions?.slice(0, 10).map((version: ModtaleVersion) => {
												const isThisVersion = selectedVersion === version.version;
												return (
													<Button
														key={version.version}
														variant={isThisVersion ? 'default' : 'outline'}
														size="sm"
														className="w-full text-xs justify-start"
														onClick={() => {
															if (isThisVersion) {
																onRemove();
															} else {
																onSelectVersion(version.version, version.fileName);
															}
														}}
													>
														<span className="truncate">{version.fileName}</span>
													</Button>
												);
										  })
										: null}
								</div>
							)}
						</div>
					</div>
				</CollapsibleContent>
			</div>
		</Collapsible>
	);
}
