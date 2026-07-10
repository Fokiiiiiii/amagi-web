import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Loader2, ShieldCheck, Sparkles } from 'lucide-react'
import type React from 'react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '../../components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/Card'
import { Input } from '../../components/ui/Input'
import { Modal } from '../../components/ui/Modal'
import { queryKeys } from '../../lib/queryKeys'
import { ApiError, api } from '../../services/api'
import type {
	CatalogEquipmentEntry,
	CatalogShipEntry,
	CatalogSkinEntry,
	PerfectAccountApplyResult,
	PerfectAccountPreview,
	PerfectAccountRequest,
	PlayerResourceEntry,
	PlayerShipEntry,
} from '../../types'

type PerfectAccountModalProps = {
	isOpen: boolean
	onClose: () => void
	playerId: number
	catalogEquipments: CatalogEquipmentEntry[]
	catalogShips: CatalogShipEntry[]
	catalogSkins: CatalogSkinEntry[]
	playerResources: PlayerResourceEntry[]
	playerShips: PlayerShipEntry[]
}

type DraftState = PerfectAccountRequest
type ToggleField = Exclude<keyof DraftState, 'equipment_mode' | 'confirm'>

export const DEFAULT_PERFECT_ACCOUNT_DRAFT: DraftState = {
	ships: true,
	max_ship_progression: true,
	max_skills: true,
	skins: true,
	equipments: true,
	equipment_mode: 'collection',
	resources: true,
	expand_capacity: true,
}

export const buildPerfectAccountRequest = (draft: DraftState, confirm = false): PerfectAccountRequest => ({
	...draft,
	confirm,
})

export const isPerfectAccountConfirmationValid = (playerId: number, confirmText: string) =>
	confirmText.trim() === String(playerId)

export const hasUnsupportedFullEquipmentMode = (preview: PerfectAccountPreview | null) =>
	Boolean(preview?.unsupported_operations?.some((operation) => operation.field === 'equipment_mode'))

const formatIds = (values: Array<number | string> | null | undefined) => {
	if (!values || values.length === 0) return 'None'
	return values.join(', ')
}

const formatCountInfo = (label: string, info: { count: number; max_id: number }) =>
	`${label}: count ${info.count}, max ID ${info.max_id}`

export const PerfectAccountModal: React.FC<PerfectAccountModalProps> = ({
	isOpen,
	onClose,
	playerId,
	catalogEquipments,
	catalogShips,
	catalogSkins,
	playerResources,
	playerShips,
}) => {
	const queryClient = useQueryClient()
	const [draft, setDraft] = useState<DraftState>(DEFAULT_PERFECT_ACCOUNT_DRAFT)
	const [preview, setPreview] = useState<PerfectAccountPreview | null>(null)
	const [applyResult, setApplyResult] = useState<PerfectAccountApplyResult | null>(null)
	const [confirmPlayerId, setConfirmPlayerId] = useState('')

	const shipNameById = useMemo(() => new Map(catalogShips.map((ship) => [ship.id, ship.name])), [catalogShips])
	const skinNameById = useMemo(() => new Map(catalogSkins.map((skin) => [skin.id, skin.name])), [catalogSkins])
	const equipmentNameById = useMemo(
		() => new Map(catalogEquipments.map((equipment) => [equipment.id, equipment.name])),
		[catalogEquipments],
	)

	const playerShipById = useMemo(() => new Map(playerShips.map((ship) => [ship.owned_id, ship])), [playerShips])
	const resourceById = useMemo(
		() => new Map(playerResources.map((resource) => [resource.resource_id, resource])),
		[playerResources],
	)

	const previewMutation = useMutation({
		mutationFn: (payload: PerfectAccountRequest) => api.previewPerfectAccount(playerId, payload),
	})

	const applyMutation = useMutation({
		mutationFn: (payload: PerfectAccountRequest) => api.applyPerfectAccount(playerId, payload),
		onSuccess: async () => {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: queryKeys.players.detail(playerId) }),
				queryClient.invalidateQueries({ queryKey: queryKeys.players.resources(playerId) }),
				queryClient.invalidateQueries({ queryKey: queryKeys.players.items(playerId) }),
				queryClient.invalidateQueries({ queryKey: queryKeys.players.ships(playerId) }),
				queryClient.invalidateQueries({ queryKey: queryKeys.players.skins(playerId) }),
			])
		},
	})

	const previewResetRef = useRef(previewMutation.reset)
	const applyResetRef = useRef(applyMutation.reset)
	const wasOpenRef = useRef(false)
	useEffect(() => {
		previewResetRef.current = previewMutation.reset
		applyResetRef.current = applyMutation.reset
	}, [previewMutation.reset, applyMutation.reset])

	const resetState = useMemo(
		() => () => {
			setDraft(DEFAULT_PERFECT_ACCOUNT_DRAFT)
			setPreview(null)
			setApplyResult(null)
			setConfirmPlayerId('')
			previewResetRef.current()
			applyResetRef.current()
		},
		[],
	)

	useEffect(() => {
		if (isOpen && !wasOpenRef.current) {
			resetState()
		}
		wasOpenRef.current = isOpen
	}, [isOpen, resetState])

	const request = useMemo(() => buildPerfectAccountRequest(draft), [draft])
	const fullEquipmentUnsupported = hasUnsupportedFullEquipmentMode(preview)

	const handleToggle = (field: ToggleField) => {
		setDraft((current) => ({ ...current, [field]: !current[field] }))
		setPreview(null)
		setApplyResult(null)
	}

	const handleModeChange = (value: 'collection' | 'full') => {
		setDraft((current) => ({ ...current, equipment_mode: value }))
		setPreview(null)
		setApplyResult(null)
	}

	const handlePreview = async () => {
		const response = await previewMutation.mutateAsync(request)
		setPreview(response.data)
		setApplyResult(null)
	}

	const handleApply = async () => {
		if (confirmPlayerId.trim() !== String(playerId)) {
			return
		}
		const response = await applyMutation.mutateAsync(buildPerfectAccountRequest(draft, true))
		setApplyResult(response.data)
		await queryClient.invalidateQueries({ queryKey: queryKeys.catalog.equipments() })
		const refreshed = await previewMutation.mutateAsync(request)
		setPreview(refreshed.data)
	}

	const renderPreviewSummary = () => {
		if (preview === null) {
			return <p className="text-sm text-muted-foreground">Preview has not been run yet.</p>
		}
		const warnings = preview.warnings ?? []
		const unsupportedOperations = preview.unsupported_operations ?? []

		return (
			<div className="space-y-4">
				<div className="grid gap-3 md:grid-cols-3">
					<div className="rounded-lg border border-border bg-muted/20 p-3">
						<div className="text-xs uppercase tracking-wide text-muted-foreground">Target Player</div>
						<div className="mt-1 text-sm font-medium">{preview.target_player_id}</div>
					</div>
					<div className="rounded-lg border border-border bg-muted/20 p-3">
						<div className="text-xs uppercase tracking-wide text-muted-foreground">Estimated Inserts</div>
						<div className="mt-1 text-sm font-medium">{preview.estimated_inserts}</div>
					</div>
					<div className="rounded-lg border border-border bg-muted/20 p-3">
						<div className="text-xs uppercase tracking-wide text-muted-foreground">Estimated Updates</div>
						<div className="mt-1 text-sm font-medium">{preview.estimated_updates}</div>
					</div>
				</div>

				<div className="grid gap-3 md:grid-cols-3">
					<div className="rounded-lg border border-border bg-muted/20 p-3">
						<div className="text-xs uppercase tracking-wide text-muted-foreground">Unchanged Rows</div>
						<div className="mt-1 text-sm font-medium">{preview.estimated_unchanged_rows}</div>
					</div>
					<div className="rounded-lg border border-border bg-muted/20 p-3">
						<div className="text-xs uppercase tracking-wide text-muted-foreground">Current Resources</div>
						<div className="mt-1 text-sm font-medium">{playerResources.length}</div>
					</div>
					<div className="rounded-lg border border-border bg-muted/20 p-3">
						<div className="text-xs uppercase tracking-wide text-muted-foreground">Current Ships</div>
						<div className="mt-1 text-sm font-medium">{playerShips.length}</div>
					</div>
				</div>

				<div className="grid gap-4 xl:grid-cols-2">
					<Card>
						<CardHeader>
							<CardTitle className="text-base">Ships</CardTitle>
						</CardHeader>
						<CardContent className="space-y-3 text-sm">
							<div>
								Current owned ship templates:{' '}
								{formatIds(
									preview.current_owned_unique_ship_ids.map(
										(id) => `${id} ${shipNameById.get(id) ? `(${shipNameById.get(id)})` : ''}`,
									),
								)}
							</div>
							<div>Missing ships: {preview.missing_ship_ids?.length ?? 0}</div>
							<div className="max-h-44 overflow-auto rounded-md border border-border bg-muted/10 p-3 text-xs">
								{preview.missing_ship_ids && preview.missing_ship_ids.length > 0 ? (
									<ul className="space-y-1">
										{preview.missing_ship_ids.map((id) => (
											<li key={id}>
												<span className="font-mono">{id}</span>
												{shipNameById.get(id) ? (
													<span className="text-muted-foreground"> - {shipNameById.get(id)}</span>
												) : null}
											</li>
										))}
									</ul>
								) : (
									<p className="text-muted-foreground">No missing ships.</p>
								)}
							</div>
							<div>
								Existing ships selected for progression: {preview.existing_ships_selected_for_progression.length}
							</div>
							<div className="max-h-44 overflow-auto rounded-md border border-border bg-muted/10 p-3 text-xs">
								{preview.existing_ships_selected_for_progression.length > 0 ? (
									<ul className="space-y-1">
										{preview.existing_ships_selected_for_progression.map((ownedId) => {
											const ship = playerShipById.get(ownedId)
											const name = ship ? (shipNameById.get(ship.ship_id) ?? ship.name) : 'Unknown ship'
											return (
												<li key={ownedId}>
													<span className="font-mono">{ownedId}</span>
													<span className="text-muted-foreground"> - {name}</span>
												</li>
											)
										})}
									</ul>
								) : (
									<p className="text-muted-foreground">No existing ships selected.</p>
								)}
							</div>
						</CardContent>
					</Card>

					<Card>
						<CardHeader>
							<CardTitle className="text-base">Skins and Equipment</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4 text-sm">
							<div>
								<div className="font-medium">Missing skins: {preview.missing_skin_ids?.length ?? 0}</div>
								<div className="mt-2 max-h-32 overflow-auto rounded-md border border-border bg-muted/10 p-3 text-xs">
									{preview.missing_skin_ids && preview.missing_skin_ids.length > 0 ? (
										<ul className="space-y-1">
											{preview.missing_skin_ids.map((id) => (
												<li key={id}>
													<span className="font-mono">{id}</span>
													{skinNameById.get(id) ? (
														<span className="text-muted-foreground"> - {skinNameById.get(id)}</span>
													) : null}
												</li>
											))}
										</ul>
									) : (
										<p className="text-muted-foreground">No missing skins.</p>
									)}
								</div>
							</div>

							<div>
								<div className="font-medium">Equipment deficits</div>
								<div className="mt-2 max-h-44 overflow-auto rounded-md border border-border bg-muted/10 p-3 text-xs">
									{Object.entries(preview.required_equipment_quantities).length > 0 ? (
										<ul className="space-y-1">
											{Object.entries(preview.required_equipment_quantities)
												.map(([id, target]) => {
													const equipmentId = Number(id)
													const current = preview.current_equipment_quantities[equipmentId] ?? 0
													return { equipmentId, current, target }
												})
												.filter(({ current, target }) => current < target)
												.map(({ equipmentId, current, target }) => (
													<li key={equipmentId}>
														<span className="font-mono">{equipmentId}</span>
														<span className="text-muted-foreground">
															{' '}
															- {equipmentNameById.get(equipmentId) ?? 'Equipment'}: {current}/{target}
														</span>
													</li>
												))}
										</ul>
									) : (
										<p className="text-muted-foreground">No equipment data.</p>
									)}
								</div>
							</div>
						</CardContent>
					</Card>
				</div>

				<Card>
					<CardHeader>
						<CardTitle className="text-base">Resources and Capacity</CardTitle>
					</CardHeader>
					<CardContent className="space-y-4 text-sm">
						<div>
							<div className="font-medium">Resources</div>
							<div className="mt-2 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
								{preview.resource_changes.length > 0 ? (
									preview.resource_changes.map((change) => (
										<div key={change.resource_id} className="rounded-md border border-border bg-muted/10 p-3 text-xs">
											<div className="font-mono">
												{change.resource_id}{' '}
												{resourceById.get(change.resource_id)?.name
													? `- ${resourceById.get(change.resource_id)?.name}`
													: ''}
											</div>
											<div className="text-muted-foreground">
												Current {change.current} • Target {change.target} • Delta {change.delta}
											</div>
										</div>
									))
								) : (
									<p className="text-muted-foreground">No resource changes.</p>
								)}
							</div>
						</div>

						<div>
							<div className="font-medium">Capacity</div>
							<div className="mt-2 grid gap-2 md:grid-cols-2">
								{preview.capacity_changes.length > 0 ? (
									preview.capacity_changes.map((change) => (
										<div key={change.field} className="rounded-md border border-border bg-muted/10 p-3 text-xs">
											<div className="font-mono">{change.field}</div>
											<div className="text-muted-foreground">
												Current {change.current} • Target {change.target} • Delta {change.delta}{' '}
												{change.supported ? '(supported)' : '(runtime-derived)'}
											</div>
										</div>
									))
								) : (
									<p className="text-muted-foreground">No capacity changes.</p>
								)}
							</div>
						</div>
					</CardContent>
				</Card>

				{warnings.length > 0 ? (
					<div className="rounded-lg border border-amber-400/40 bg-amber-500/10 p-3 text-sm">
						<div className="mb-2 font-medium text-amber-700 dark:text-amber-300">Warnings</div>
						<ul className="list-disc space-y-1 pl-5 text-amber-800 dark:text-amber-200">
							{warnings.map((warning) => (
								<li key={warning}>{warning}</li>
							))}
						</ul>
					</div>
				) : null}

				{unsupportedOperations.length > 0 ? (
					<div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
						<div className="mb-2 font-medium text-destructive">Unsupported operations</div>
						<ul className="space-y-1">
							{unsupportedOperations.map((operation) => (
								<li key={`${operation.field}-${operation.reason}`} className="text-destructive">
									<span className="font-mono">{operation.field}</span>: {operation.reason}
								</li>
							))}
						</ul>
					</div>
				) : null}
			</div>
		)
	}

	const renderApplyResult = () => {
		if (applyResult === null) {
			return null
		}
		const unsupportedOperations = applyResult.unsupported_operations ?? []

		return (
			<div className="space-y-3 rounded-lg border border-border bg-muted/10 p-4 text-sm">
				<div className="flex items-center gap-2 font-medium">
					<CheckCircle2 className="h-4 w-4 text-emerald-500" />
					Apply Result
				</div>
				<div className="grid gap-2 md:grid-cols-3">
					<div>Inserted rows: {applyResult.inserted_rows}</div>
					<div>Updated rows: {applyResult.updated_rows}</div>
					<div>Unchanged rows: {applyResult.unchanged_rows}</div>
				</div>
				{applyResult.inserted_rows === 0 && applyResult.updated_rows === 0 ? (
					<div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-3 text-emerald-700 dark:text-emerald-300">
						No changes required.
					</div>
				) : null}
				{applyResult.backup_path ? (
					<div className="text-xs text-muted-foreground">Backup: {applyResult.backup_path}</div>
				) : null}
				<div className="grid gap-2 md:grid-cols-2">
					<div className="rounded-md border border-border bg-background p-3 text-xs">
						<div className="font-medium">Before counts</div>
						<ul className="mt-2 space-y-1 text-muted-foreground">
							{Object.entries(applyResult.verification.before_counts).map(([table, info]) => (
								<li key={table}>{formatCountInfo(table, info)}</li>
							))}
						</ul>
					</div>
					<div className="rounded-md border border-border bg-background p-3 text-xs">
						<div className="font-medium">After counts</div>
						<ul className="mt-2 space-y-1 text-muted-foreground">
							{Object.entries(applyResult.verification.after_counts).map(([table, info]) => (
								<li key={table}>{formatCountInfo(table, info)}</li>
							))}
						</ul>
					</div>
				</div>
				<div className="grid gap-2 md:grid-cols-2">
					<div className="rounded-md border border-border bg-background p-3 text-xs">
						<div className="font-medium">Duplicate IDs</div>
						<div className="mt-2 text-muted-foreground">{formatIds(applyResult.verification.duplicate_ids)}</div>
					</div>
					<div className="rounded-md border border-border bg-background p-3 text-xs">
						<div className="font-medium">Foreign keys</div>
						<ul className="mt-2 space-y-1 text-muted-foreground">
							{applyResult.verification.foreign_keys.map((fk) => (
								<li key={`${fk.table}-${fk.column}-${fk.reference}`}>
									{fk.table}.{fk.column} → {fk.reference} ({fk.orphans})
								</li>
							))}
						</ul>
					</div>
				</div>
				{unsupportedOperations.length > 0 ? (
					<div className="rounded-md border border-amber-400/40 bg-amber-500/10 p-3 text-xs">
						<div className="font-medium text-amber-700 dark:text-amber-300">Unsupported operations</div>
						<ul className="mt-2 space-y-1 text-amber-800 dark:text-amber-200">
							{unsupportedOperations.map((operation) => (
								<li key={`${operation.field}-${operation.reason}`}>
									{operation.field}: {operation.reason}
								</li>
							))}
						</ul>
					</div>
				) : null}
			</div>
		)
	}

	return (
		<Modal
			isOpen={isOpen}
			onClose={onClose}
			title="Perfect Account"
			panelClassName="max-h-[80vh] max-w-5xl overflow-y-auto"
		>
			<div className="space-y-5">
				<div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
					<Card>
						<CardHeader className="flex flex-row items-center gap-2">
							<Sparkles className="h-5 w-5 text-primary" />
							<CardTitle className="text-base">Options</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4 text-sm">
							<label className="flex items-center gap-2">
								<input type="checkbox" checked={draft.ships} onChange={() => handleToggle('ships')} />
								All ships
							</label>
							<label className="flex items-center gap-2">
								<input
									type="checkbox"
									checked={draft.max_ship_progression}
									onChange={() => handleToggle('max_ship_progression')}
								/>
								Max supported ship progression
							</label>
							<label className="flex items-center gap-2">
								<input type="checkbox" checked={draft.max_skills} onChange={() => handleToggle('max_skills')} />
								Max skills
							</label>
							<label className="flex items-center gap-2">
								<input type="checkbox" checked={draft.skins} onChange={() => handleToggle('skins')} />
								All skins
							</label>
							<label className="flex items-center gap-2">
								<input type="checkbox" checked={draft.equipments} onChange={() => handleToggle('equipments')} />
								All equipments
							</label>
							<div className="space-y-2">
								<div className="text-sm font-medium">Equipment mode</div>
								<div className="flex gap-3">
									<label className="flex items-center gap-2">
										<input
											type="radio"
											name="equipment-mode"
											checked={draft.equipment_mode === 'collection'}
											onChange={() => handleModeChange('collection')}
										/>
										Collection
									</label>
									<label className="flex items-center gap-2">
										<input
											type="radio"
											name="equipment-mode"
											checked={draft.equipment_mode === 'full'}
											onChange={() => handleModeChange('full')}
										/>
										Full
									</label>
								</div>
								{fullEquipmentUnsupported ? (
									<p className="text-xs text-destructive">
										Server reports that full mode is unsupported: only collection mode is available.
									</p>
								) : (
									<p className="text-xs text-muted-foreground">
										Collection mode requests one of each grantable equipment.
									</p>
								)}
							</div>
							<label className="flex items-center gap-2">
								<input type="checkbox" checked={draft.resources} onChange={() => handleToggle('resources')} />
								Resources
							</label>
							<label className="flex items-center gap-2">
								<input
									type="checkbox"
									checked={draft.expand_capacity}
									onChange={() => handleToggle('expand_capacity')}
								/>
								Expand capacity
							</label>

							<div className="flex gap-2 pt-2">
								<Button
									type="button"
									variant="secondary"
									onClick={() => void handlePreview()}
									disabled={previewMutation.isPending || applyMutation.isPending}
								>
									{previewMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
									Preview
								</Button>
								<Button
									type="button"
									variant="ghost"
									onClick={resetState}
									disabled={previewMutation.isPending || applyMutation.isPending}
								>
									Reset
								</Button>
							</div>

							{previewMutation.isError ? (
								<div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
									{previewMutation.error instanceof ApiError
										? previewMutation.error.message
										: 'Failed to build perfect-account preview.'}
								</div>
							) : null}
							{applyMutation.isError ? (
								<div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
									{applyMutation.error instanceof ApiError
										? applyMutation.error.message
										: 'Failed to apply perfect-account changes.'}
								</div>
							) : null}
						</CardContent>
					</Card>

					<Card>
						<CardHeader className="flex flex-row items-center gap-2">
							<ShieldCheck className="h-5 w-5 text-primary" />
							<CardTitle className="text-base">Preview</CardTitle>
						</CardHeader>
						<CardContent className="space-y-4">
							{renderPreviewSummary()}
							{renderApplyResult()}
							<div className="space-y-2 rounded-lg border border-border bg-muted/10 p-4 text-sm">
								<div className="font-medium">Confirm Apply</div>
								<p className="text-xs text-muted-foreground">Type the player ID to enable apply.</p>
								<Input
									value={confirmPlayerId}
									onChange={(event) => setConfirmPlayerId(event.target.value)}
									placeholder={String(playerId)}
								/>
								<div className="flex justify-end gap-2 pt-2">
									<Button type="button" variant="ghost" onClick={onClose} disabled={applyMutation.isPending}>
										Close
									</Button>
									<Button
										type="button"
										onClick={() => void handleApply()}
										disabled={
											preview === null ||
											applyMutation.isPending ||
											previewMutation.isPending ||
											confirmPlayerId.trim() !== String(playerId) ||
											(draft.equipment_mode === 'full' && fullEquipmentUnsupported)
										}
									>
										{applyMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
										Apply
									</Button>
								</div>
							</div>
						</CardContent>
					</Card>
				</div>
				{preview !== null ? (
					<div className="rounded-md border border-border bg-muted/10 p-3 text-xs text-muted-foreground">
						Preview and apply stay separate: rerun preview after changing options or after apply.
					</div>
				) : null}
			</div>
		</Modal>
	)
}
