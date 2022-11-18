# Statefull animator library

All animators are updated during a static `Animator.update(deltaMs)` call that should be executed each frame.

Alternatively an animator can be created in detached mode, a detached animator has to be updated independently each frame.

During the update routine the current state's `animation` callback is executed. A single animator state lifecycle looks like this:

1. `setup` callback is called when a state is entered
2. animator is halted for `delayBefore` ms
3. for `duration` ms `animation` callback is called every update
4. animator is halted for `delayAfter` ms
5. if `transition` is a string stage is changed to given state and the cycle repeats, if its a function its called and the result is used as the next state

Few notes:
- all callbacks have two arguments, `self` pointing to the animator instance and `params` being simply a shortcut to `self.parameters`
- `self.parameters` can be used to store user data on the animation instance, it in not used internally 
- default initial state is called `initial`. Animator can be started from a different initial state by passing the state name to the `start` method
- `stop` is a special state, transitioning to it will stop the animator
- `animation` callback is always called at least once, even if `duration` is 0
- progress of current state (based on duration) can be accessed as `self.progress`, the value is in the range from 0 to 1
- `animation` callback is always called with `self.progress` equal to 1 to ensure proper end states of animated objects
- returning `false` from `transition` callback prevents state transition. If state has `loop` set to true the state will reset (`setup` callback and delays will not executed). If `loop` is not set animator will retry calling `transition` next update.
- `pause` is a special state, transitioning to `pause` stops update calls until `resume` is called on the animator.
- `interrupt` callback, if set, is called after every `animation` callback. Returning `false` continues normal operation, returning a string executes a state transition. It can be used trigger a state transition mid duration.
- `overflow` controls precise timing. It is set by default. When set if a states duration is 20ms and update call happened and 25ms that 5s will be cut from next state's duration.
- duration / delays and other state parameters can be changed dynamically during runtime from callbacks. `update` callback is usually used for this. Current state configuration can be accessed via `self.currentState`, other states can be accessed via `self.states.[state name]`
- `self.interpolate(from, to, func)` call can be used to easily animate a value using a given easing function. `self.progress` will be used internally. Easing function can be selected from one of many presets (based on standard css easing functions) or be passed as a function.

full state configuration object below:
```typescript
export interface State<P extends Record<string, any>, T extends string> {
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
```