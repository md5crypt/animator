/* (C) 2021 Marek Korzeniowski, distributed under the MIT License */

import * as BezierEasing from "bezier-easing"

export interface State<P> {
	duration: number
	delayBefore: number
	delayAfter: number
	loop: boolean
	transition: string | ((context: Animator<P>) => string | false)
	interrupt?: ((context: Animator<P>) => string | false)
	animation: (context: Animator<P>) => void
	setup?: (context: Animator<P>) => void
}

export type TransitionName = keyof typeof Animator["transitions"]

type InternalState<P> = State<P> & {name: string}

class Listener<T extends (...args: any[]) => void = () => void> {
	private list: T[] = []

	public add(listener: T) {
		this.list.push(listener)
		return listener
	}

	public remove(listener: T) {
		const i = this.list.indexOf(listener)
		if (i >= 0) {
			this.list.splice(i, 1)
			return true
		}
		return false
	}

	public clear() {
		this.list = []
	}

	public invoke(...args: Parameters<T>) {
		for (let i = 0; i < this.list.length; i++) {
			(this.list[i] as Function)(...args)
		}
	}
}

export class Animator<P extends Record<string, any> = Record<string, any>> {
	public readonly states: Record<string, InternalState<P>>

	public static readonly transitions = {
		// easeIn
		easeIn: BezierEasing(0.43, 0, 1, 1),
		easeInSine: BezierEasing(0.47, 0, 0.74, 0.71),
		easeInQuadratic: BezierEasing(0.55, 0.09, 0.68, 0.53),
		easeInCubic: BezierEasing(0.55, 0.06, 0.68, 0.19),
		easeInQuartic: BezierEasing(.9,.03,.69,.22),
		easeInQuintic: BezierEasing(.76,.05,.86,.06),
		easeInExponential: BezierEasing(.95,.05,.8,.04),
		easeInCircular: BezierEasing(0.6, 0.04, 0.98, 0.34),
		easeInBackward: BezierEasing(0.6, -0.28, 0.74, 0.05),
		// easeOut
		easeOut: BezierEasing(0, 0, 0.58, 1),
		easeOutSine: BezierEasing(0.39, 0.575, 0.565, 1),
		easeOutQuadratic: BezierEasing(0.25, 0.46, 0.45, 0.94),
		easeOutCubic: BezierEasing(0.215, 0.61, 0.355, 1),
		easeOutQuartic: BezierEasing(0.165, 0.84, 0.44, 1),
		easeOutQuintic: BezierEasing(0.23, 1, 0.32, 1),
		easeOutExponential: BezierEasing(0.19, 1, 0.22, 1),
		easeOutCircular: BezierEasing(0.075, 0.82, 0.165, 1),
		easeOutBackward: BezierEasing(0.175, 0.885, 0.32, 1.275),
		// other
		linear: (x: number) => x,
		easeInOut: BezierEasing(0.43, 0, 0.58, 1),
		easeInOutBackward: BezierEasing(0.68, -0.55, 0.265, 1.55)
	} as const

	private static runningSet: Set<Animator<any>> = new Set()
	private static _time = 0
	private static _delta = 0

	private startTime: number

	private state: InternalState<P> | null
	private animating: boolean
	private _running: boolean
	private _started: boolean
	private _paused: boolean
	private _progress: number
	public readonly parameters: P
	public readonly onStateChange: Listener<(state: string) => void>

	public static createEasingFunction(x1: number, y1: number, x2: number, y2: number) {
		return BezierEasing(x1, y1, x2, y2)
	}

	public static easeValue(value: number, func: keyof typeof Animator["transitions"]) {
		return this.transitions[func](value)
	}

	public static get time() {
		return this._time
	}

	public static get delta() {
		return this._delta
	}

	public static testState(state: string, query: string | RegExp | ((name: string | null) => void) = "stop") {
		if (typeof query == "string") {
			return query == state
		} else if (query instanceof RegExp) {
			return query.test(state)
		} else {
			return query(state)
		}
	}

	public constructor(states: Record<string, Partial<State<P>>>, parameters?: P) {
		if (states.stop) {
			throw new Error("a state can not be called 'stop' as it is a reserved name")
		}
		this.states = {}
		for (const key in states) {
			this.states[key] = {
				name: key,
				duration: 0,
				delayAfter: 0,
				delayBefore: 0,
				loop: false,
				transition: () => false,
				animation: () => {},
				...states[key]
			}
		}
		this.animating = false
		this._started = false
		this._running = false
		this._paused = false
		this._progress = 0
		this.startTime = 0
		this.state = null
		this.onStateChange = new Listener()
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

	public get running() {
		return this._running
	}

	public get paused() {
		return this._paused
	}

	public pause() {
		if (this._started && !this._paused) {
			Animator.runningSet.delete(this)
			this._paused = true
		}
	}

	public resume() {
		if (this._paused) {
			Animator.runningSet.add(this)
			this._paused = false
		}
	}

	public start(initialState = "initial") {
		if (!this._started || this._paused) {
			this._paused = false
			this.state = this.states[initialState]
			if (!this.state) {
				throw new Error(`state initial "${initialState}" not found`)
			}
			this._started = true
			this._running = false
			Animator.runningSet.add(this)
		}
		return this
	}

	public stop(noStateChangeEvent = false) {
		if (this._started) {
			this._paused = false
			Animator.runningSet.delete(this)
			this._started = false
			this._running = false
			if (this.state) {
				this.state = null
				if (!noStateChangeEvent) {
					this.onStateChange.invoke("stop")
				}
			}
		}
		return this
	}

	public static update(delta: number) {
		Animator._time += delta
		Animator._delta = delta
		if (Animator.runningSet.size > 0) {
			Animator.runningSet.forEach(x => x.update(Animator._time))
		}
	}

	private update(current: number) {
		if (!this._started) {
			throw new Error("not running")
		}
		if (!this._running) {
			this._running = true
			this.startTime = current
			this.animating = true
			this._started = true
			this._progress = 0
			if (!this.state) {
				throw new Error("state is missing")
			}
			this.state.setup?.(this)
			this.onStateChange.invoke(this.state.name)
		}
		let iterationLimit = 1024
		while (true) {
			iterationLimit -= 1
			if (!iterationLimit) {
				throw new Error("animator iteration limit reached, endless loop?")
			}
			const state = this.state!
			if (state.delayBefore > (current - this.startTime)) {
				return
			}
			let progress = state.duration ? (current - (this.startTime + state.delayBefore)) / state.duration : Infinity
			if (!this.animating || (progress >= 1)) {
				if (this._progress != 1) {
					this._progress = 1
					state.animation(this)
				}
				if (current - (this.startTime + state.delayBefore + state.duration) < state.delayAfter) {
					return
				}
				const nextStateName = typeof state.transition == "string" ? state.transition : state.transition(this)
				if (nextStateName == "stop") {
					this.stop()
					return
				} else if (nextStateName) {
					const nextState = this.states[nextStateName]
					if (!nextState) {
						throw new Error(`could not find state ${nextStateName}`)
					}
					this._progress = 0
					if (this.animating) {
						this.startTime += state.duration + state.delayBefore + state.delayAfter
					} else {
						this.startTime = current
					}
					this.state = nextState
					nextState.setup?.(this)
					this.onStateChange.invoke(nextStateName)
					// the callback could have called stop()
					if (!this._started) {
						return
					}
					this.animating = true
					continue
				} else if (state.loop && state.duration) {
					this._progress = 0
					this.startTime += state.duration + state.delayAfter
					continue
				} else {
					this.animating = false
				}
			} else {
				if (state.interrupt) {
					const nextStateName = state.interrupt(this)
					if (nextStateName == "stop") {
						this.stop()
						return
					} else if (nextStateName) {
						const nextState = this.states[nextStateName]
						if (!nextState) {
							throw new Error(`could not find state ${nextStateName}`)
						}
						this._progress = 0
						this.startTime = current
						this.state = nextState
						nextState.setup?.(this)
						this.onStateChange.invoke(nextStateName)
						// the callback could have called stop()
						if (!this._started) {
							return
						}
						this.animating = true
						continue
					}
				}
				this._progress = progress
				state.animation(this)
			}
			break
		}
	}

	public interpolate(from: number, to: number, func: keyof typeof Animator["transitions"] | BezierEasing.EasingFunction = "easeInOut") {
		return from + (to - from) * (typeof func == "string" ? Animator.transitions[func] : func)(this._progress)
	}

	public steps<T>(steps: {progress: number, value: T}[]) {
		for (let i = steps.length - 1; i >= 0; i -= 1) {
			if (steps[i].progress <= this._progress) {
				return steps[i].value
			}
		}
		return steps[0].value
	}

	public get currentState() {
		if (!this.state) {
			throw new Error("not running")
		}
		return this.state
	}

	public waitForState(query: string | RegExp | ((name: string | null) => void) = "stop") {
		if (Animator.testState(this.state ? this.state.name : "stop", query)) {
			return Promise.resolve()
		}
		return new Promise<void>(resolve => {
			const callback = this.onStateChange.add(state => {
				if (Animator.testState(state, query)) {
					this.onStateChange.remove(callback)
					resolve()
				}
			})
		})
	}
}

export default Animator
