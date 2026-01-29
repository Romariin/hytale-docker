'use client';

import { useState, useCallback, useEffect } from 'react';
import { Search, Package, Loader2, ChevronLeft, ChevronRight, KeyRound, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/styled-tabs';
import {
	Empty,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
	EmptyDescription,
} from '@/components/ui/empty';
import { ModCard } from './ModCard';
import type { ConfigState, CurseForgeMod, SelectedMod, PaginationInfo } from './types';
import { PAGE_SIZE } from './types';

interface CurseForgeTabProps {
	config: ConfigState;
	onConfigChange: (updates: Partial<ConfigState>) => void;
}

export function CurseForgeTab({ config, onConfigChange }: CurseForgeTabProps) {
	const [modTab, setModTab] = useState<'all' | 'selected'>('all');
	const [modSearch, setModSearch] = useState('');
	const [mods, setMods] = useState<CurseForgeMod[]>([]);
	const [loadingMods, setLoadingMods] = useState(false);
	const [modsError, setModsError] = useState<string | null>(null);
	const [pagination, setPagination] = useState<PaginationInfo | null>(null);
	const [currentPage, setCurrentPage] = useState(0);
	const [expandedMod, setExpandedMod] = useState<number | string | null>(null);
	const [showApiKey, setShowApiKey] = useState(false);
	const [loadingVersions, setLoadingVersions] = useState<Record<number, boolean>>({});

	const fetchMods = useCallback(
		async (search?: string, page = 0, sort = 'popularity', apiKey?: string) => {
			if (!apiKey) {
				setMods([]);
				return;
			}

			setLoadingMods(true);
			setModsError(null);
			try {
				const sortFieldMap: Record<string, string> = {
					popularity: '2',
					downloads: '6',
					updated: '3',
					name: '4',
				};

				const response = await fetch('/api/curseforge', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						search,
						index: page * PAGE_SIZE,
						pageSize: PAGE_SIZE,
						sortField: sortFieldMap[sort] || '2',
						key: apiKey,
					}),
				});

				if (!response.ok) {
					throw new Error('Failed to fetch mods');
				}

				const data = await response.json();
				setMods(data.data || []);
				setPagination(data.pagination || null);
			} catch {
				setModsError('Unable to load mods from CurseForge');
				setMods([]);
				setPagination(null);
			} finally {
				setLoadingMods(false);
			}
		},
		[]
	);

	const fetchFiles = useCallback(
		async (modId: number) => {
			if (!config.cfApiKey) return;

			// Check if full file list already loaded (we use a flag in the mod object)
			const mod = mods.find((m) => m.id === modId);
			if (mod && (mod as any).fullFilesLoaded) return;

			setLoadingVersions((prev) => ({ ...prev, [modId]: true }));
			try {
				const response = await fetch(`/api/curseforge/${modId}`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						key: config.cfApiKey,
					}),
				});

				if (!response.ok) {
					throw new Error('Failed to fetch files');
				}

				const data = await response.json();

				// Update the mod with full file list and mark as loaded
				setMods((prevMods) =>
					prevMods.map((m) =>
						m.id === modId
							? { ...m, latestFiles: data.files || [], fullFilesLoaded: true } as any
							: m
					)
				);
			} catch (error) {
				console.error('Failed to fetch files:', error);
			} finally {
				setLoadingVersions((prev) => ({ ...prev, [modId]: false }));
			}
		},
		[config.cfApiKey, mods]
	);

	// Only fetch mods if API key is present
	useEffect(() => {
		if (config.cfApiKey) {
			fetchMods(undefined, 0, 'popularity', config.cfApiKey);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		const timer = setTimeout(() => {
			setCurrentPage(0);
			fetchMods(modSearch || undefined, 0, 'popularity', config.cfApiKey);
		}, 300);
		return () => clearTimeout(timer);
		}, [modSearch, config.cfApiKey, fetchMods]);

	const handlePageChange = (newPage: number) => {
		setCurrentPage(newPage);
		fetchMods(modSearch || undefined, newPage, 'popularity', config.cfApiKey);
	};

	const cfMods = config.selectedMods.filter((m) => m.provider === 'curseforge');

	const addMod = (mod: CurseForgeMod, fileId?: number, fileName?: string) => {
		if (!cfMods.find((m) => m.id === mod.id)) {
			onConfigChange({
				selectedMods: [
					...config.selectedMods,
					{
						provider: 'curseforge',
						id: mod.id,
						name: mod.name,
						slug: mod.slug,
						summary: mod.summary,
						downloadCount: mod.downloadCount,
						logo: mod.logo,
						links: mod.links,
						authors: mod.authors,
						latestFilesIndexes: mod.latestFilesIndexes,
						fileId,
						fileName,
						versionType: fileId ? 'specific' : 'latest',
						version: fileId ? String(fileId) : undefined,
					},
				],
			});
		}
	};

	const updateModVersion = (modId: number, fileId?: number, fileName?: string) => {
		onConfigChange({
			selectedMods: config.selectedMods.map((m) =>
				m.id === modId
					? {
							...m,
							fileId,
							fileName,
							versionType: fileId ? 'specific' : 'latest',
							version: fileId ? String(fileId) : undefined,
					  }
					: m
			),
		});
	};

	const removeMod = (modId: number) => {
		onConfigChange({
			selectedMods: config.selectedMods.filter((m) => m.id !== modId),
		});
	};

	const totalPages = pagination ? Math.ceil(pagination.totalCount / PAGE_SIZE) : 0;

	return (
		<div className="flex flex-col gap-3 mt-4 flex-1 min-h-0">
			{/* CurseForge API Key */}
			<div className="space-y-2">
				<Label htmlFor="cfApiKey">CurseForge API Key</Label>
				<div className="relative">
					<Input
						id="cfApiKey"
						type={showApiKey ? 'text' : 'password'}
						value={config.cfApiKey}
						onChange={(e) => onConfigChange({ cfApiKey: e.target.value })}
						placeholder="Your CurseForge API key"
						className="pr-10"
					/>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
						onClick={() => setShowApiKey(!showApiKey)}
						tabIndex={-1}
					>
						{showApiKey ? (
							<EyeOff className="w-4 h-4 text-muted-foreground" />
						) : (
							<Eye className="w-4 h-4 text-muted-foreground" />
						)}
					</Button>
				</div>
				<p className="text-xs text-muted-foreground">
					Required for downloading mods. Get one at{' '}
					<a
						href="https://console.curseforge.com/"
						target="_blank"
						rel="noopener noreferrer"
						className="text-primary hover:underline"
					>
						console.curseforge.com
					</a>
				</p>
			</div>

			{/* All Mods / Selected Mods Tabs */}
			<Tabs
				value={modTab}
				onValueChange={(v) => setModTab(v as 'all' | 'selected')}
				className="flex flex-col flex-1 min-h-0"
			>
				<TabsList className="w-full grid grid-cols-2 shrink-0">
					<TabsTrigger value="all">All Mods</TabsTrigger>
					<TabsTrigger value="selected">Selected Mods ({cfMods.length})</TabsTrigger>
				</TabsList>

				<TabsContent value="all" className="flex flex-col gap-3 flex-1 min-h-0 mt-3">
					{/* Search */}
					<div className="flex gap-2">
						<div className="relative flex-1">
							<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
							<Input
								value={modSearch}
								onChange={(e) => setModSearch(e.target.value)}
								placeholder="Search mods..."
								className="pl-9"
							/>
						</div>
					</div>

					{/* Mod List */}
					{!config.cfApiKey ? (
						<div className="flex-1 min-h-64 border rounded-lg flex items-center justify-center">
							<Empty className="border-0 flex-none">
								<EmptyHeader>
									<EmptyMedia variant="icon">
										<KeyRound className="w-5 h-5" />
									</EmptyMedia>
									<EmptyTitle>API Key Required</EmptyTitle>
									<EmptyDescription>
										Enter your CurseForge API key above to browse and add mods to your
										server.
									</EmptyDescription>
								</EmptyHeader>
							</Empty>
						</div>
					) : loadingMods ? (
						<div className="flex-1 min-h-64 border rounded-lg flex items-center justify-center py-8">
							<Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
						</div>
					) : modsError ? (
						<div className="flex-1 min-h-64 border rounded-lg flex flex-col items-center justify-center gap-2 p-4 text-center">
							<Package className="w-8 h-8 text-muted-foreground" />
							<p className="text-sm text-muted-foreground">{modsError}</p>
							<Button variant="outline" size="sm" onClick={() => fetchMods()}>
								Retry
							</Button>
						</div>
					) : mods.length === 0 ? (
						<div className="flex-1 min-h-64 border rounded-lg flex flex-col items-center justify-center gap-2 p-4 text-center">
							<Package className="w-8 h-8 text-muted-foreground" />
							<p className="text-sm text-muted-foreground">No Hytale mods found</p>
						</div>
					) : (
						<ScrollArea className="flex-1 min-h-64 border rounded-lg">
							<div className="p-2 space-y-2">
								{mods.map((mod) => {
									const selectedMod = cfMods.find((m) => m.id === mod.id);
									const isSelected = !!selectedMod;

									return (
										<ModCard
											key={mod.id}
											mod={mod}
											provider="curseforge"
											isSelected={isSelected}
											selectedVersion={selectedMod?.fileId}
											isExpanded={expandedMod === mod.id}
											isLoadingVersions={loadingVersions[mod.id]}
											onToggleExpand={(open) => {
												setExpandedMod(open ? mod.id : null);
												if (open) {
													fetchFiles(mod.id);
												}
											}}
											onSelectVersion={(fileId, fileName) => {
												if (isSelected) {
													updateModVersion(mod.id, fileId as number, fileName);
												} else {
													addMod(mod, fileId as number, fileName);
												}
											}}
											onRemove={() => removeMod(mod.id)}
										/>
									);
								})}
							</div>
						</ScrollArea>
					)}

					{/* Pagination */}
					{pagination && totalPages > 1 && (
						<div className="flex items-center justify-between pt-2">
							<p className="text-xs text-muted-foreground">
								Showing {currentPage * PAGE_SIZE + 1}-
								{Math.min((currentPage + 1) * PAGE_SIZE, pagination.totalCount)} of{' '}
								{pagination.totalCount}
							</p>
							<div className="flex items-center gap-1">
								<Button
									variant="outline"
									size="icon"
									className="h-7 w-7"
									disabled={currentPage === 0}
									onClick={() => handlePageChange(currentPage - 1)}
								>
									<ChevronLeft className="w-4 h-4" />
								</Button>
								<span className="text-sm px-2">
									{currentPage + 1} / {totalPages}
								</span>
								<Button
									variant="outline"
									size="icon"
									className="h-7 w-7"
									disabled={currentPage >= totalPages - 1}
									onClick={() => handlePageChange(currentPage + 1)}
								>
									<ChevronRight className="w-4 h-4" />
								</Button>
							</div>
						</div>
					)}
				</TabsContent>

				<TabsContent value="selected" className="flex flex-col gap-3 flex-1 min-h-0 mt-3">
					{cfMods.length === 0 ? (
						<div className="flex-1 min-h-64 border rounded-lg flex items-center justify-center">
							<Empty className="border-0 flex-none">
								<EmptyHeader>
									<EmptyMedia variant="icon">
										<Package className="w-5 h-5" />
									</EmptyMedia>
									<EmptyTitle>No Mods Selected</EmptyTitle>
									<EmptyDescription>
										Browse the "All Mods" tab to find and add CurseForge mods to your server
										configuration.
									</EmptyDescription>
								</EmptyHeader>
							</Empty>
						</div>
					) : (
						<ScrollArea className="flex-1 min-h-64 border rounded-lg">
							<div className="p-2 space-y-2">
								{cfMods.map((mod: SelectedMod) => (
									<ModCard
										key={mod.id}
										mod={mod}
										provider="curseforge"
										isSelected={true}
										selectedVersion={mod.fileId}
										isExpanded={expandedMod === mod.id}
										onToggleExpand={(open) => setExpandedMod(open ? mod.id : null)}
										onSelectVersion={(fileId, fileName) =>
											updateModVersion(mod.id as number, fileId as number, fileName)
										}
										onRemove={() => removeMod(mod.id as number)}
									/>
								))}
							</div>
						</ScrollArea>
					)}
				</TabsContent>
			</Tabs>
		</div>
	);
}
