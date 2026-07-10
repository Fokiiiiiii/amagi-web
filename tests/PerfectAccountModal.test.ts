import { expect, test } from 'bun:test'
import {
	DEFAULT_PERFECT_ACCOUNT_DRAFT,
	buildPerfectAccountRequest,
	hasUnsupportedFullEquipmentMode,
	isPerfectAccountConfirmationValid,
} from '../src/pages/player-detail/PerfectAccountModal'

test('default perfect-account draft enables all supported toggles', () => {
	expect(DEFAULT_PERFECT_ACCOUNT_DRAFT).toEqual({
		ships: true,
		max_ship_progression: true,
		max_skills: true,
		skins: true,
		equipments: true,
		equipment_mode: 'collection',
		resources: true,
		expand_capacity: true,
	})
})

test('perfect-account request builder preserves options and sets confirmation separately', () => {
	const draft = { ...DEFAULT_PERFECT_ACCOUNT_DRAFT, equipment_mode: 'full' as const, resources: false }
	const request = buildPerfectAccountRequest(draft, true)
	expect(request).toMatchObject({
		...draft,
		confirm: true,
	})
	expect(draft).toMatchObject({
		equipment_mode: 'full',
		resources: false,
	})
})

test('confirmation only passes on an exact player id match', () => {
	expect(isPerfectAccountConfirmationValid(100001, '100001')).toBe(true)
	expect(isPerfectAccountConfirmationValid(100001, ' 100001 ')).toBe(true)
	expect(isPerfectAccountConfirmationValid(100001, '100002')).toBe(false)
})

test('full equipment mode is detected from unsupported preview operations', () => {
	expect(hasUnsupportedFullEquipmentMode(null)).toBe(false)
	expect(
		hasUnsupportedFullEquipmentMode({
			target_player_id: 1,
			current_owned_unique_ship_ids: [],
			missing_ship_ids: [],
			existing_ships_selected_for_progression: [],
			current_skin_ids: [],
			missing_skin_ids: [],
			current_equipment_quantities: {},
			required_equipment_quantities: {},
			resource_changes: [],
			capacity_changes: [],
			unsupported_operations: [{ field: 'equipment_mode', reason: 'only collection mode is supported' }],
			warnings: [],
			estimated_inserts: 0,
			estimated_updates: 0,
			estimated_unchanged_rows: 0,
		}),
	).toBe(true)
})
