'use client';

import { useState, useCallback, useEffect } from 'react';
import { Search, Package, Loader2, ChevronLeft, ChevronRight, Filter, KeyRound, Eye, EyeOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/styled-tabs';
import {
	Empty,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
	EmptyDescription,
} from '@/components/ui/empty';
import { ModCard } from './ModCard';
import type { ConfigState, ModtaleMod, SelectedMod, PaginationInfo } from './types';
import { PAGE_SIZE } from './types';

interface ModtaleTabProps {
	config: ConfigState;
	onConfigChange: (updates: Partial<ConfigState>) => void;
}

export function ModtaleTab({ config, onConfigChange }: ModtaleTabProps) {
	const [modTab, setModTab] = useState<'all' | 'selected'>('all');
	const [modSearch, setModSearch] = useState('');
	const [mods, setMods] = useState<ModtaleMod[]>([]);
	const [loadingMods, setLoadingMods] = useState(false);
	const [modsError, setModsError] = useState<string | null>(null);
	const [pagination, setPagination] = useState<PaginationInfo | null>(null);
	const [currentPage, setCurrentPage] = useState(0);
	const [expandedMod, setExpandedMod] = useState<number | string | null>(null);
	const [showApiKey, setShowApiKey] = useState(false);
	const [loadingVersions, setLoadingVersions] = useState<Record<string, boolean>>({});

	const fetchMods = useCallback(
		async (search?: string, page = 0, apiKey?: string) => {
			if (!apiKey) {
				setMods([]);
				return;
			}

			setLoadingMods(true);
			setModsError(null);
			try {
				const response = await fetch('/api/modtale', {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						search,
						index: page * PAGE_SIZE,
						pageSize: PAGE_SIZE,
						key: apiKey,
					}),
				});

				if (!response.ok) {
					throw new Error('Failed to fetch mods');
				}

				const data = await response.json();
				const nextMods = (data.data || []).map((mod: ModtaleMod & { downloadCount?: number }) => ({
					...mod,
					downloads: typeof mod.downloads === 'number' ? mod.downloads : mod.downloadCount ?? 0,
				}));
				setMods(nextMods);
				setPagination(data.pagination || null);
			} catch {
				setModsError('Unable to load mods from Modtale');
				setMods([]);
				setPagination(null);
			} finally {
				setLoadingMods(false);
			}
		},
		[]
	);

	const fetchVersions = useCallback(
		async (modId: string) => {
			if (!config.mtApiKey) return;

			// Check if versions already loaded
			const mod = mods.find((m) => m.id === modId);
			if (mod && mod.versions && mod.versions.length > 0) return;

			setLoadingVersions((prev) => ({ ...prev, [modId]: true }));
			try {
				const response = await fetch(`/api/modtale/${modId}`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify({
						key: config.mtApiKey,
					}),
				});

				if (!response.ok) {
					throw new Error('Failed to fetch versions');
				}

				const data = await response.json();

				// Update the mod with versions
				setMods((prevMods) =>
					prevMods.map((m) =>
						m.id === modId ? { ...m, versions: data.versions || [] } : m
					)
				);
			} catch (error) {
				console.error('Failed to fetch versions:', error);
			} finally {
				setLoadingVersions((prev) => ({ ...prev, [modId]: false }));
			}
		},
		[config.mtApiKey, mods]
	);

	// Only fetch mods if API key is present
	useEffect(() => {
		if (config.mtApiKey) {
			fetchMods(undefined, 0, config.mtApiKey);
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	useEffect(() => {
		const timer = setTimeout(() => {
			setCurrentPage(0);
			fetchMods(modSearch || undefined, 0, config.mtApiKey);
		}, 300);
		return () => clearTimeout(timer);
	}, [modSearch, config.mtApiKey, fetchMods]);

	const handlePageChange = (newPage: number) => {
		setCurrentPage(newPage);
		fetchMods(modSearch || undefined, newPage, config.mtApiKey);
	};

	const mtMods = config.selectedMods.filter((m) => m.provider === 'modtale');

	const addMod = (mod: ModtaleMod, version?: string, fileName?: string) => {
		if (!mtMods.find((m) => m.id === mod.id)) {
			onConfigChange({
				selectedMods: [
					...config.selectedMods,
					{
						provider: 'modtale',
						id: mod.id,
						name: mod.name,
						slug: mod.slug,
						summary: mod.summary,
						downloadCount: mod.downloads,
						imageUrl: mod.imageUrl,
						version,
						fileName,
						versionType: version ? 'specific' : 'latest',
					},
				],
			});
		}
	};

	const updateModVersion = (modId: string, version?: string, fileName?: string) => {
		onConfigChange({
			selectedMods: config.selectedMods.map((m) =>
				m.id === modId
					? {
							...m,
							version,
							fileName,
							versionType: version ? 'specific' : 'latest',
					  }
					: m
			),
		});
	};

	const removeMod = (modId: string) => {
		onConfigChange({
			selectedMods: config.selectedMods.filter((m) => m.id !== modId),
		});
	};

	const totalPages = pagination ? Math.ceil(pagination.totalCount / PAGE_SIZE) : 0;

	return (
		<div className="flex flex-col gap-3 mt-4 flex-1 min-h-0">
			{/* Modtale API Key */}
			<div className="space-y-2">
				<Label htmlFor="mtApiKey">Modtale API Key</Label>
				<div className="relative">
					<Input
						id="mtApiKey"
						type={showApiKey ? 'text' : 'password'}
						value={config.mtApiKey}
						onChange={(e) => onConfigChange({ mtApiKey: e.target.value })}
						placeholder="Your Modtale API key"
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
						href="https://modtale.net/dashboard/developer"
						target="_blank"
						rel="noopener noreferrer"
						className="text-primary hover:underline"
					>
						modtale.net/dashboard/developer
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
					<TabsTrigger value="selected">Selected Mods ({mtMods.length})</TabsTrigger>
				</TabsList>

				<TabsContent value="all" className="flex flex-col gap-3 flex-1 min-h-0 mt-3">
					{/* Search Row */}
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
					{!config.mtApiKey ? (
						<div className="flex-1 min-h-64 border rounded-lg flex items-center justify-center">
							<Empty className="border-0 flex-none">
								<EmptyHeader>
									<EmptyMedia variant="icon">
										<KeyRound className="w-5 h-5" />
									</EmptyMedia>
									<EmptyTitle>API Key Required</EmptyTitle>
									<EmptyDescription>
										Enter your Modtale API key above to browse and add mods to your server.
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
									const selectedMod = mtMods.find((m) => m.id === mod.id);
									const isSelected = !!selectedMod;

									return (
										<ModCard
											key={mod.id}
											mod={mod}
											provider="modtale"
											isSelected={isSelected}
											selectedVersion={selectedMod?.version}
											isExpanded={expandedMod === mod.id}
											isLoadingVersions={loadingVersions[mod.id]}
											onToggleExpand={(open) => {
												setExpandedMod(open ? mod.id : null);
												if (open) {
													fetchVersions(mod.id);
												}
											}}
											onSelectVersion={(version, fileName) => {
												if (isSelected) {
													updateModVersion(mod.id, version as string, fileName);
												} else {
													addMod(mod, version as string, fileName);
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
					{mtMods.length === 0 ? (
						<div className="flex-1 min-h-64 border rounded-lg flex items-center justify-center">
							<Empty className="border-0 flex-none">
								<EmptyHeader>
									<EmptyMedia variant="icon">
										<Package className="w-5 h-5" />
									</EmptyMedia>
									<EmptyTitle>No Mods Selected</EmptyTitle>
									<EmptyDescription>
										Browse the "All Mods" tab to find and add Modtale mods to your server
										configuration.
									</EmptyDescription>
								</EmptyHeader>
							</Empty>
						</div>
					) : (
						<ScrollArea className="flex-1 min-h-64 border rounded-lg">
							<div className="p-2 space-y-2">
								{mtMods.map((mod: SelectedMod) => (
									<ModCard
										key={mod.id}
										mod={mod}
										provider="modtale"
										isSelected={true}
										selectedVersion={mod.version}
										isExpanded={expandedMod === mod.id}
										onToggleExpand={(open) => setExpandedMod(open ? mod.id : null)}
										onSelectVersion={(version, fileName) =>
											updateModVersion(mod.id as string, version as string, fileName)
										}
										onRemove={() => removeMod(mod.id as string)}
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
