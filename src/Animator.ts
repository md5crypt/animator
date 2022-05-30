/* (C) 2021 Marek Korzeniowski, distributed under the MIT License */

import * as BezierEasing from "bezier-easing"
import Listener from "@md5crypt/listener"

export interface State<P, T extends string> {
	duration: number
	delayBefore: number
	delayAfter: number
	loop: boolean
	overflow: boolean
	transition: string | ((context: Animator<P, T>, params: P) => string | false)
	interrupt?: ((context: Animator<P, T>, params: P) => string | false)
	animation: (context: Animator<P, T>, params: P) => void
	setup?: (context: Animator<P, T>, params: P) => void
}

export type TransitionName = keyof typeof Animator["transitions"]

type InternalState<P, T extends string> = State<P, T> & {name: string}

export class Animator<P extends Record<string, any> = Record<string, any>, T extends string = string> {
	public readonly states: Record<T, InternalState<P, T>>

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
	private static _delta = 0

	private startTime: number

	private state: InternalState<P, T> | null
	private animating: boolean
	private _running: boolean
	private _started: boolean
	private _paused: boolean
	private _progress: number
	public readonly parameters: P
	public readonly onStateChange: Listener<(state: string) => void>
	public timeScale: number
	private _time: number
	private _delta: number

	public static createEasingFunction(x1: number, y1: number, x2: number, y2: number) {
		return BezierEasing(x1, y1, x2, y2)
	}

	public static easeValue(value: number, func: keyof typeof Animator["transitions"]) {
		return this.transitions[func](value)
	}

	public static get delta() {
		return this._delta
	}

	public static testState(state: string, query: string | RegExp | ((name: string) => void) = "stop") {
		if (typeof query == "string") {
			return query == state
		} else if (query instanceof RegExp) {
			return query.test(state)
		} else {
			return query(state)
		}
	}

	public constructor(states: Record<T, Partial<State<P, T>>>, parameters?: P) {
		if ("stop" in states) {
			throw new Error("a state can not be called 'stop' as it is a reserved name")
		}
		if ("pause" in states) {
			throw new Error("a state can not be called 'pause' as it is a reserved name")
		}
		this.states = {} as any
		for (const key in states) {
			this.states[key as T] = {
				name: key,
				duration: 0,
				delayAfter: 0,
				delayBefore: 0,
				loop: false,
				overflow: true,
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
		this._delta = 0
		this._time = 0
		this.startTime = 0
		this.state = null
		this.onStateChange = new Listener()
		this.timeScale = 1
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
			this.onStateChange.invoke("pause")
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
			this.state = this.states[initialState as T]
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
		Animator._delta = delta
		if (Animator.runningSet.size > 0) {
			Animator.runningSet.forEach(x => x.update(delta))
		}
	}

	public update(delta: number) {
		const scaledDelta = delta * this.timeScale
		const current = this._time + scaledDelta
		this._delta = scaledDelta
		this._time = current
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
			this.state.setup?.(this, this.parameters)
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
					state.animation(this, this.parameters)
				}
				if (current - (this.startTime + state.delayBefore + state.duration) < state.delayAfter) {
					return
				}
				const nextStateName = typeof state.transition == "string" ? state.transition : state.transition(this, this.parameters)
				if (nextStateName == "stop") {
					this.stop()
					return
				} else if (nextStateName == "pause") {
					this.animating = false
					this.pause()
					return
				} else if (nextStateName) {
					const nextState = this.states[nextStateName as T]
					if (!nextState) {
						throw new Error(`could not find state ${nextStateName}`)
					}
					this._progress = 0
					if (this.animating && state.overflow) {
						this.startTime += state.duration + state.delayBefore + state.delayAfter
					} else {
						this.startTime = current
					}
					this.state = nextState
					nextState.setup?.(this, this.parameters)
					this.onStateChange.invoke(nextStateName)
					// the callback could have called stop() or pause()
					if (!this._started || this.paused) {
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
				this._progress = progress
				state.animation(this, this.parameters)
				if (state.interrupt) {
					const nextStateName = state.interrupt(this, this.parameters)
					if (nextStateName == "stop") {
						this.stop()
						return
					} else if (nextStateName == "pause") {
						this.pause()
						return
					} else if (nextStateName) {
						const nextState = this.states[nextStateName as T]
						if (!nextState) {
							throw new Error(`could not find state ${nextStateName}`)
						}
						this._progress = 0
						this.startTime = current
						this.state = nextState
						nextState.setup?.(this, this.parameters)
						this.onStateChange.invoke(nextStateName)
						// the callback could have called stop()
						if (!this._started) {
							return
						}
						this.animating = true
						continue
					}
				}
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

	public get time() {
		return this._time
	}

	public get delta() {
		return this._delta
	}

	public waitForState(query: string | RegExp | ((name: string) => void) = "stop") {
		if (this._paused && Animator.testState(this.state!.name, query)) {
			return Promise.resolve()
		}
		if (Animator.testState(this.state ? this.state.name : "stop", query)) {
			return Promise.resolve()
		}
		return new Promise<void>(resolve => {
			this.onStateChange.add(state => {
				if (Animator.testState(state, query)) {
					resolve()
					return Listener.REMOVE
				}
				return
			})
		})
	}
}

export default Animator
