import type React from 'react'
import { createContext, useContext, useEffect, useState } from 'react'

type Theme = 'dark' | 'light' | 'system'

interface ThemeProviderProps {
	children?: React.ReactNode
	defaultTheme?: Theme
	storageKey?: string
}

interface ThemeProviderState {
	theme: Theme
	setTheme: (theme: Theme) => void
}

const ThemeProviderContext = createContext<ThemeProviderState | null>(null)
const LEGACY_THEME_STORAGE_KEYS = ['belfast-admin-theme']

const loadStoredTheme = (storageKey: string, defaultTheme: Theme) => {
	const currentTheme = localStorage.getItem(storageKey) as Theme | null
	if (currentTheme) return currentTheme
	for (const legacyKey of LEGACY_THEME_STORAGE_KEYS) {
		const legacyTheme = localStorage.getItem(legacyKey) as Theme | null
		if (legacyTheme) {
			localStorage.setItem(storageKey, legacyTheme)
			return legacyTheme
		}
	}
	return defaultTheme
}

export function ThemeProvider({
	children,
	defaultTheme = 'system',
	storageKey = 'theme',
	...props
}: ThemeProviderProps) {
	const [theme, setTheme] = useState<Theme>(() => loadStoredTheme(storageKey, defaultTheme))

	useEffect(() => {
		const root = window.document.documentElement
		root.classList.remove('light', 'dark')

		if (theme === 'system') {
			const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
			root.classList.add(systemTheme)
			return
		}

		root.classList.add(theme)
	}, [theme])

	const value = {
		theme,
		setTheme: (nextTheme: Theme) => {
			localStorage.setItem(storageKey, nextTheme)
			setTheme(nextTheme)
		},
	}

	return (
		<ThemeProviderContext.Provider {...props} value={value}>
			{children}
		</ThemeProviderContext.Provider>
	)
}

export const useTheme = () => {
	const context = useContext(ThemeProviderContext)
	if (!context) throw new Error('useTheme must be used within a ThemeProvider')
	return context
}
