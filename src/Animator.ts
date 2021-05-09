/* (C) 2021 Marek Korzeniowski, distributed under the MIT License */

import * as BezierEasing from "bezier-easing"

const transitions = {
	linear: (x: number) => x,
	easeIn: BezierEasing(0.43, 0, 1, 1),
	easeInSine: BezierEasing(0.47, 0, 0.74, 0.71),
	easeInQuadratic: BezierEasing(0.55, 0.09, 0.68, 0.53),
	easeInCubic: BezierEasing(0.55, 0.06, 0.68, 0.19),
	easeInQuartic: BezierEasing(.9,.03,.69,.22),
	easeInQuintic: BezierEasing(.76,.05,.86,.06),
	easeInExponential: BezierEasing(.95,.05,.8,.04),
	easeInCircular: BezierEasing(0.6, 0.04, 0.98, 0.34),
	easeInBackward: BezierEasing(0.6, -0.28, 0.74, 0.05),
	easeOut: BezierEasing(0, 0, 0.58, 1),
	easeInOut: BezierEasing(0.43, 0, 0.58, 1)
} as const

interface State<P> {
	duration: number
	delayBefore: number
	delayAfter: number
	loop: boolean
	transition: string | ((context: Animator<P>) => string | false)
	animation: (context: Animator<P>) => void
	setup?: (context: Animator<P>) => void
}

export class Animator<P extends Record<string, any>> {
	private static runningSet: Set<Animator<any>> = new Set()
	private static time = 0

	private startTime: number
	private states: Record<string, State<P>>
	private state: State<P> | null
	private running: boolean
	private _started: boolean
	private _progress: number
	public readonly parameters: P
	public onStateChange?: (state: string | null) => void

	public constructor(states: Record<string, Partial<State<P>>>, parameters?: P) {
		if (states.stop) {
			throw new Error("a state can not be called 'stop' as it is a reserved name")
		}
		this.states = {}
		for (const key in states) {
			this.states[key] = {
				duration: 0,
				delayAfter: 0,
				delayBefore: 0,
				loop: false,
				transition: () => false,
				animation: () => {},
				...states[key]
			}
		}
		this.running = false
		this._started = false
		this._progress = 0
		this.startTime = 0
		this.state = null
		if (parameters) {
			this.parameters = parameters
		} else {
			this.parameters = {} as P
		}
	}

	public get progress() {
		return this._progress
	}

	public get started() {
		return this._started
	}

	public start(initialState = "initial") {
		if (this._started) {
			throw new Error("already running")
		}
		const state = this.states[initialState]
		if (!state) {
			throw new Error(`state initial "${initialState}" not found`)
		}
		this.state = state
		this.running = true
		this._started = true
		this._progress = 0
		this.startTime = Animator.time
		Animator.runningSet.add(this)
		state.setup?.(this)
		this.onStateChange?.(initialState)
		return this
	}

	public stop() {
		if (this._started) {
			Animator.runningSet.delete(this)
			this._started = false
			if (this.state) {
				this.state = null
				this.onStateChange?.(null)
			}
		}
	}

	public static update(delta: number) {
		Animator.time += delta
		if (Animator.runningSet.size > 0) {
			Animator.runningSet.forEach(x => x.update(Animator.time))
		}
	}

	private update(current: number) {
		if (!this._started) {
			throw new Error("not running")
		}
		let state = this.state!
		if (state.delayBefore > (current - this.startTime)) {
			return
		}
		let progress = state.duration ? (current - (this.startTime + state.delayBefore)) / state.duration : 1
		if (!this.running || (progress >= 1)) {
			if (current - (this.startTime + state.delayBefore + state.duration) < state.delayAfter) {
				if (this._progress != 1) {
					this._progress = 1
					state.animation(this)
				}
				return
			}
			const nextStateName = typeof state.transition == "string" ? state.transition : state.transition(this)
			if (nextStateName == "stop") {
				this._progress = 1
				state.animation(this)
				this.stop()
				return
			} else if (nextStateName) {
				const nextState = this.states[nextStateName]
				if (!nextState) {
					throw new Error(`could not find state ${nextStateName}`)
				}
				// ensure final animation frame was executed
				if (this._progress != 1) {
					this._progress = 1
					state.animation(this)
				}
				if (this.running) {
					this.startTime += state.duration + state.delayBefore + state.delayAfter
					progress = Math.max(0, nextState.duration ? (current - (this.startTime + state.delayBefore)) / nextState.duration : 0)
				} else {
					this.startTime = current
					progress = 0
				}
				this.state = nextState
				state = nextState
				nextState.setup?.(this)
				this.onStateChange?.(nextStateName)
				// the callback could have called stop()
				if (!this._started) {
					return
				}
				this.running = true
			}
		}
		if (!this.running) {
			return
		}
		if (progress >= 1) {
			if (state.loop) {
				const delta = (current - this.startTime - state.delayBefore) % state.duration
				this.startTime = current - delta
				progress = delta / state.duration
			} else {
				this.running = false
				progress = 1
			}
		}
		this._progress = progress
		state.animation(this)
	}

	public interpolate(from: number, to: number, func: keyof typeof transitions = "easeInOut") {
		return from + (to - from) * transitions[func](this._progress)
	}

	public steps<T>(steps: {progress: number, value: T}[]) {
		for (let i = steps.length - 1; i >= 0; i -= 1) {
			if (steps[i].progress <= this._progress) {
				return steps[i].value
			}
		}
		return steps[0].value
	}
}
