'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '@/components/ui/select';
import type { ConfigState } from './types';

interface ServerTabProps {
	config: ConfigState;
	onConfigChange: (updates: Partial<ConfigState>) => void;
}

export function ServerTab({ config, onConfigChange }: ServerTabProps) {
	const [showPassword, setShowPassword] = useState(false);

	return (
		<div className="space-y-6 mt-4">
			{/* Server Name */}
			<div className="space-y-2">
				<Label htmlFor="serverName">Server Name</Label>
				<Input
					id="serverName"
					value={config.serverName}
					onChange={(e) => onConfigChange({ serverName: e.target.value })}
					placeholder="Hytale Server"
				/>
				<p className="text-xs text-muted-foreground">
					The name displayed in the server browser
				</p>
			</div>

			{/* MOTD */}
			<div className="space-y-2">
				<Label htmlFor="motd">MOTD</Label>
				<Input
					id="motd"
					value={config.motd}
					onChange={(e) => onConfigChange({ motd: e.target.value })}
					placeholder="Welcome to my server!"
				/>
				<p className="text-xs text-muted-foreground">
					Optional message shown to players when joining
				</p>
			</div>

			{/* Password */}
			<div className="space-y-2">
				<Label htmlFor="password">Server Password</Label>
				<div className="relative">
					<Input
						id="password"
						type={showPassword ? 'text' : 'password'}
						value={config.password}
						onChange={(e) => onConfigChange({ password: e.target.value })}
						placeholder="Leave empty for no password"
						className="pr-10"
					/>
					<Button
						type="button"
						variant="ghost"
						size="icon"
						className="absolute right-0 top-0 h-full px-3 hover:bg-transparent"
						onClick={() => setShowPassword(!showPassword)}
						tabIndex={-1}
					>
						{showPassword ? (
							<EyeOff className="w-4 h-4 text-muted-foreground" />
						) : (
							<Eye className="w-4 h-4 text-muted-foreground" />
						)}
					</Button>
				</div>
				<p className="text-xs text-muted-foreground">
					Optional password required to join the server
				</p>
			</div>

			{/* Max Players */}
			<div className="space-y-3">
				<div className="flex items-center justify-between">
					<Label>Max Players</Label>
					<span className="text-sm font-mono font-medium">{config.maxPlayers}</span>
				</div>
				<Slider
					value={[config.maxPlayers]}
					onValueChange={([value]) => onConfigChange({ maxPlayers: value })}
					min={1}
					max={500}
					step={1}
				/>
				<p className="text-xs text-muted-foreground">
					Maximum number of players that can join simultaneously
				</p>
			</div>

			{/* Max View Radius */}
			<div className="space-y-3">
				<div className="flex items-center justify-between">
					<Label>Max View Radius</Label>
					<span className="text-sm font-mono font-medium">{config.maxViewRadius}</span>
				</div>
				<Slider
					value={[config.maxViewRadius]}
					onValueChange={([value]) => onConfigChange({ maxViewRadius: value })}
					min={8}
					max={64}
					step={1}
				/>
				<p className="text-xs text-muted-foreground">
					Maximum render distance in chunks
				</p>
			</div>

			{/* Default World */}
			<div className="space-y-2">
				<Label htmlFor="defaultWorld">Default World</Label>
				<Input
					id="defaultWorld"
					value={config.defaultWorld}
					onChange={(e) => onConfigChange({ defaultWorld: e.target.value })}
					placeholder="default"
				/>
				<p className="text-xs text-muted-foreground">
					The world players spawn into by default
				</p>
			</div>

			{/* Default Game Mode */}
			<div className="space-y-2">
				<Label>Default Game Mode</Label>
				<Select
					value={config.defaultGameMode}
					onValueChange={(value: 'Adventure' | 'Creative') =>
						onConfigChange({ defaultGameMode: value })
					}
				>
					<SelectTrigger className="w-full">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						<SelectItem value="Adventure">Adventure</SelectItem>
						<SelectItem value="Creative">Creative</SelectItem>
						<SelectItem value="Survival">Survival</SelectItem>
					</SelectContent>
				</Select>
				<p className="text-xs text-muted-foreground">
					The game mode players start with
				</p>
			</div>
		</div>
	);
}
