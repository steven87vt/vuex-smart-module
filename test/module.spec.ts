import * as Vuex from 'vuex'
import { shallowMount } from '@vue/test-utils'
import {
  createStore,
  Getters,
  Mutations,
  Actions,
  Module,
  Context,
  createMapper,
} from '../src'
import { defineComponent, h, nextTick } from 'vue'
import { InitState } from '../src/module'

describe('Module', () => {
  class FooState {
    value = 1
  }

  class FooGetters extends Getters<FooState> {
    get double(): number {
      return this.state.value * 2
    }
  }

  class FooMutations extends Mutations<FooState> {
    inc() {
      this.state.value++
    }
    incBy(payload: { value: number }) {
      this.state.value += payload.value
    }
  }

  class FooActions extends Actions<
    FooState,
    FooGetters,
    FooMutations,
    FooActions
  > {
    inc() {
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          this.commit('inc', undefined)
          resolve()
        }, 0)
      })
    }
    incBy(payload: { value: number }) {
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          this.mutations.incBy(payload)
          resolve()
        }, 0)
      })
    }
  }

  const originalError = console.error
  afterEach(() => {
    console.error = originalError
  })

  describe('generate', () => {
    it('generates vuex module', () => {
      const m = new Module({
        state: FooState,
        getters: FooGetters,
        mutations: FooMutations,
        actions: FooActions,
      })

      const store = createStore(m)

      expect(store.state.value).toBe(1)
      expect(store.getters.double).toBe(2)
      store.commit('inc')
      expect(store.state.value).toBe(2)
      return store.dispatch('inc').then(() => {
        expect(store.state.value).toBe(3)
      })
    })

    it('generates nested modules', () => {
      const foo = new Module({
        state: FooState,
        getters: FooGetters,
        mutations: FooMutations,
        actions: FooActions,
      })

      const root = new Module({
        modules: {
          foo,
        },
      })

      const store = createStore(root)

      expect(store.state.foo.value).toBe(1)
      expect(store.getters['foo/double']).toBe(2)
      store.commit('foo/inc')
      expect(store.state.foo.value).toBe(2)
      return store.dispatch('foo/inc').then(() => {
        expect(store.state.foo.value).toBe(3)
      })
    })

    it('generates no namespaced modules', () => {
      const foo = new Module({
        namespaced: false,
        state: FooState,
        getters: FooGetters,
        mutations: FooMutations,
        actions: FooActions,
      })

      const root = new Module({
        modules: {
          foo,
        },
      })

      const store = createStore(root)

      expect(store.state.foo.value).toBe(1)
      expect(store.getters.double).toBe(2)
      store.commit('inc')
      expect(store.state.foo.value).toBe(2)
      return store.dispatch('inc').then(() => {
        expect(store.state.foo.value).toBe(3)
      })
    })

    it('handles complex namespace', () => {
      const baz = new Module({
        state: FooState,
        mutations: FooMutations,
      })

      const bar = new Module({
        namespaced: false,
        state: FooState,
        mutations: FooMutations,
        modules: {
          baz,
        },
      })

      const foo = new Module({
        state: FooState,
        mutations: FooMutations,
        modules: {
          bar,
        },
      })

      const root = new Module({
        modules: {
          foo,
        },
      })

      const store = createStore(root)

      expect(store.state.foo.value).toBe(1)
      expect(store.state.foo.bar.value).toBe(1)
      expect(store.state.foo.bar.baz.value).toBe(1)

      store.commit('foo/inc')
      expect(store.state.foo.value).toBe(2)
      expect(store.state.foo.bar.value).toBe(2)
      expect(store.state.foo.bar.baz.value).toBe(1)

      store.commit('foo/baz/inc')
      expect(store.state.foo.value).toBe(2)
      expect(store.state.foo.bar.value).toBe(2)
      expect(store.state.foo.bar.baz.value).toBe(2)
    })

    it('preserve raw vuex modules option', () => {
      const foo = new Module({
        state: FooState,
      })

      const root = new Module({
        modules: {
          foo,
        },
      })

      const store = createStore(root, {
        modules: {
          bar: {
            state: {
              value: 'bar',
            },
          },
        },
      })

      expect(store.state.foo.value).toBe(1)
      expect(store.state.bar.value).toBe('bar')
    })
  })

  describe('getters', () => {
    it('has state reference', () => {
      const root = new Module({
        state: FooState,
        getters: FooGetters,
      })

      const store = createStore(root)

      expect(store.getters.double).toBe(2)
    })

    it('has state and getters reference', () => {
      class TestGetters extends Getters<FooState> {
        get five(): number {
          return 5
        }

        get ten(): number {
          return this.getters.five * 2
        }
      }

      const root = new Module({
        state: FooState,
        getters: TestGetters,
      })

      const store = createStore(root)

      expect(store.getters.ten).toBe(10)
    })

    it('can has method style getters', () => {
      class TestGetters extends Getters<FooState> {
        add(n: number): number {
          return this.state.value + n
        }
      }

      const root = new Module({
        state: FooState,
        getters: TestGetters,
      })

      const store = createStore(root)

      expect(store.getters.add(5)).toBe(6)
    })

    it('calls $init hook', (done) => {
      class TestGetters extends Getters {
        $init(store: Vuex.Store<any>): void {
          expect(store instanceof Vuex.Store).toBe(true)
          done()
        }
      }

      const root = new Module({
        getters: TestGetters,
      })

      createStore(root)
    })

    it('collects parent getters', () => {
      class SuperGetters extends Getters {
        get a() {
          return 1
        }
      }

      class ChildGetters extends SuperGetters {
        get b() {
          return 2
        }
      }

      const root = new Module({
        getters: ChildGetters,
      })

      const store = createStore(root)

      expect(store.getters.a).toBe(1)
      expect(store.getters.b).toBe(2)
    })

    it('warns if accessing another getter directly (property)', () => {
      class TestGetters extends Getters {
        get a() {
          return 'a'
        }

        get b() {
          return this.a
        }
      }

      const spy = jest.spyOn(console, 'error').mockImplementation()

      const root = new Module({
        getters: TestGetters,
      })
      const store = createStore(root)

      expect(store.getters.b).toBe('a')
      expect(spy).toHaveBeenCalledWith(
        '[vuex-smart-module] You are accessing TestGetters#a from TestGetters#b but direct access to another getter is prohibitted.' +
          ' Access it via this.getters.a instead.'
      )
    })

    it('warns if accessing antoher getter directly (method)', () => {
      class TestGetters extends Getters {
        a() {
          return 'a'
        }

        b() {
          return this.a()
        }
      }

      const spy = jest.spyOn(console, 'error').mockImplementation()

      const root = new Module({
        getters: TestGetters,
      })
      const store = createStore(root)

      expect(store.getters.b()).toBe('a')
      expect(spy).toHaveBeenCalledWith(
        '[vuex-smart-module] You are accessing TestGetters#a from TestGetters#b but direct access to another getter is prohibitted.' +
          ' Access it via this.getters.a instead.'
      )
    })
  })

  describe('mutations', () => {
    it('has state reference', () => {
      const root = new Module({
        state: FooState,
        mutations: FooMutations,
      })

      const store = createStore(root)
      store.commit('inc')
      expect(store.state.value).toBe(2)
    })

    it('collects parent mutations', () => {
      class SuperMutations extends Mutations<FooState> {
        inc() {
          this.state.value++
        }
      }

      class ChildMutations extends SuperMutations {
        dec() {
          this.state.value--
        }
      }

      const root = new Module({
        state: FooState,
        mutations: ChildMutations,
      })

      const store = createStore(root)
      store.commit('inc')
      expect(store.state.value).toBe(2)
      store.commit('dec')
      expect(store.state.value).toBe(1)
    })

    it('warns if accessing another mutation', () => {
      class TestMutations extends Mutations {
        a() {}
        b() {
          this.a()
        }
      }

      const root = new Module({
        mutations: TestMutations,
      })

      const store = createStore(root)

      const spy = jest.spyOn(console, 'error').mockImplementation()
      store.commit('b')

      expect(spy).toHaveBeenCalledWith(
        '[vuex-smart-module] You are accessing TestMutations#a from TestMutations#b but accessing another mutation is prohibitted.' +
          ' Use an action to consolidate the mutation chain.'
      )
    })
  })

  describe('actions', () => {
    it('has state reference', (done) => {
      class TestActions extends Actions<FooState> {
        test(): void {
          expect(this.state.value).toBe(1)
          done()
        }
      }

      const root = new Module({
        state: FooState,
        actions: TestActions,
      })

      const store = createStore(root)
      store.dispatch('test')
    })

    it('has getters reference', (done) => {
      class TestActions extends Actions<FooState, FooGetters> {
        test(): void {
          expect(this.getters.double).toBe(2)
          done()
        }
      }

      const root = new Module({
        state: FooState,
        getters: FooGetters,
        actions: TestActions,
      })

      const store = createStore(root)
      store.dispatch('test')
    })

    it('has commit reference', async () => {
      const root = new Module({
        state: FooState,
        mutations: FooMutations,
        actions: FooActions,
      })

      const store = createStore(root)
      await store.dispatch('inc')
      expect(store.state.value).toBe(2)
    })

    it('has dispatch reference', (done) => {
      class TestActions extends Actions<{}, Getters, Mutations, TestActions> {
        one(): void {
          this.dispatch('two', undefined)
        }

        two(): void {
          done()
        }
      }

      const root = new Module({
        actions: TestActions,
      })

      const store = createStore(root)
      store.dispatch('one')
    })

    it('calls $init hook', (done) => {
      class TestActions extends Actions {
        $init(store: Vuex.Store<any>): void {
          expect(store instanceof Vuex.Store).toBe(true)
          done()
        }
      }

      const root = new Module({
        actions: TestActions,
      })

      createStore(root)
    })

    it('collects parent actions', () => {
      class ParentActions<
        A extends Actions<FooState, never, FooMutations, A>
      > extends Actions<FooState, never, FooMutations, A> {
        inc() {
          this.commit('inc', undefined)
        }
      }

      class ChildActions extends ParentActions<ChildActions> {
        doubleInc() {
          this.commit('inc', undefined)
          this.commit('inc', undefined)
        }
      }

      const root = new Module({
        state: FooState,
        mutations: FooMutations,
        actions: ChildActions,
      })

      const store = createStore(root)
      store.dispatch('inc')
      expect(store.state.value).toBe(2)
      store.dispatch('doubleInc')
      expect(store.state.value).toBe(4)
    })

    it('warns if accessing another action directly', () => {
      class TestActions extends Actions {
        a() {}
        b() {
          this.a()
        }
      }

      const root = new Module({
        actions: TestActions,
      })

      const store = createStore(root)

      const spy = jest.spyOn(console, 'error').mockImplementation()
      store.dispatch('b')

      expect(spy).toHaveBeenCalledWith(
        '[vuex-smart-module] You are accessing TestActions#a from TestActions#b but direct access to another action is prohibitted.' +
          " Access it via this.dispatch('a') instead."
      )
    })

    describe('sinai style dispatch', () => {
      class TestActions extends Actions<
        FooState,
        FooGetters,
        FooMutations,
        TestActions
      > {
        inc(): Promise<void> {
          return new Promise((resolve) => {
            setTimeout(() => {
              this.mutations.inc()
              resolve()
            }, 0)
          })
        }
        incBy(payload: { value: number }): Promise<void> {
          return new Promise((resolve) => {
            setTimeout(() => {
              this.mutations.incBy(payload)
              resolve()
            }, 0)
          })
        }
        one(): Promise<void> {
          return this.actions.inc()
        }
        incByTwo(): Promise<void> {
          return this.actions.incBy({ value: 2 })
        }
      }
      it('has mutations reference', async () => {
        const root = new Module({
          state: FooState,
          mutations: FooMutations,
          actions: TestActions,
        })
        const store = createStore(root)
        await store.dispatch('inc')
        expect(store.state.value).toBe(2)
      })

      it('has actions reference', async () => {
        const root = new Module({
          state: FooState,
          mutations: FooMutations,
          actions: TestActions,
        })
        const store = createStore(root)
        await store.dispatch('one')
        expect(store.state.value).toBe(2)
      })

      it('mutation payload is passed correctly', async () => {
        const root = new Module({
          state: FooState,
          mutations: FooMutations,
          actions: TestActions,
        })
        const store = createStore(root)
        await store.dispatch('incBy', { value: 2 })
        expect(store.state.value).toBe(3)
      })

      it('dispatch payload is passed correctly', async () => {
        const root = new Module({
          state: FooState,
          mutations: FooMutations,
          actions: TestActions,
        })
        const store = createStore(root)
        await store.dispatch('incByTwo')
        expect(store.state.value).toBe(3)
      })

      it('collects parent actions', () => {
        class ParentActions<
          A extends Actions<FooState, never, FooMutations, any>
        > extends Actions<FooState, never, FooMutations, A> {
          inc() {
            this.mutations.inc()
          }
        }

        class ChildActions extends ParentActions<ChildActions> {
          doubleInc() {
            this.mutations.inc()
            this.mutations.inc()
          }
        }

        const root = new Module({
          state: FooState,
          mutations: FooMutations,
          actions: ChildActions,
        })

        const store = createStore(root)
        store.dispatch('inc')
        expect(store.state.value).toBe(2)
        store.dispatch('doubleInc')
        expect(store.state.value).toBe(4)
      })
    })
  })

  describe('context', () => {
    it('works like a local context object', () => {
      const foo = new Module({
        state: FooState,
        getters: FooGetters,
        mutations: FooMutations,
        actions: FooActions,
      })

      const root = new Module({
        modules: {
          foo,
        },
      })

      const store = createStore(root)

      const ctx = foo.context(store)

      expect(ctx.state.value).toBe(1)
      expect(ctx.getters.double).toBe(2)
      ctx.commit('inc', undefined)
      expect(ctx.state.value).toBe(2)
      return ctx.dispatch('inc', undefined).then(() => {
        expect(ctx.state.value).toBe(3)
      })
    })

    it("can be used in other module's getter", () => {
      const foo = new Module({
        state: FooState,
        getters: FooGetters,
        mutations: FooMutations,
        actions: FooActions,
      })

      class TestGetters extends Getters {
        foo!: Context<typeof foo>

        $init(store: Vuex.Store<any>): void {
          this.foo = foo.context(store)
        }

        get triple(): number {
          return this.foo.state.value + this.foo.getters.double
        }
      }

      const test = new Module({
        getters: TestGetters,
      })

      const root = new Module({
        modules: {
          test,
          foo,
        },
      })

      const store = createStore(root)

      expect(store.getters['test/triple']).toBe(3)
    })

    describe('sinai style dispatch', () => {
      it("can be used in other module's action", async () => {
        const foo = new Module({
          state: FooState,
          getters: FooGetters,
          mutations: FooMutations,
          actions: FooActions,
        })

        class TestActions extends Actions {
          foo!: Context<typeof foo>

          $init(store: Vuex.Store<any>): void {
            this.foo = foo.context(store)
          }

          incByTwo(): Promise<unknown> {
            return this.foo.actions.incBy({ value: 2 })
          }
        }

        const test = new Module({
          actions: TestActions,
        })

        const root = new Module({
          modules: {
            test,
            foo,
          },
        })

        const store = createStore(root)

        await store.dispatch('test/incByTwo')
        expect(store.state.foo.value).toBe(3)
      })
    })

    it('edge case: local getters should not try to register an empty getter', () => {
      class FooGetters extends Getters {
        get test() {
          return 1
        }
      }

      class BarGetters extends Getters {
        get a() {
          return 2
        }

        get b() {
          return 3
        }
      }

      const foo = new Module({
        getters: FooGetters,
      })

      const bar = new Module({
        namespaced: false,
        getters: BarGetters,
      })

      const store = createStore(
        new Module({
          modules: {
            foo,
            bar,
          },
        })
      )

      expect(foo.context(store).getters.test).toBe(1)
    })

    it('does not access old store state via ctx', () => {
      class FooState {
        test: string | null = null
      }

      class FooMutations extends Mutations<FooState> {
        update(value: string) {
          this.state.test = value
        }
      }

      class FooActions extends Actions<
        FooState,
        never,
        FooMutations,
        FooActions
      > {
        update(value: string) {
          this.mutations.update(value)
        }
      }

      const root = new Module({
        state: FooState,
        mutations: FooMutations,
        actions: FooActions,
      })

      const storeA = createStore(root)
      expect(storeA.state.test).toBe(null)
      storeA.dispatch('update', 'a')
      expect(storeA.state.test).toBe('a')

      const storeB = createStore(root)
      expect(storeB.state.test).toBe(null)
      storeB.dispatch('update', 'b')
      expect(storeA.state.test).toBe('a')
      expect(storeB.state.test).toBe('b')
    })
  })

  it("can be used in other module's action", () => {
    const foo = new Module({
      state: FooState,
      getters: FooGetters,
      mutations: FooMutations,
      actions: FooActions,
    })

    class TestActions extends Actions {
      foo!: Context<typeof foo>

      $init(store: Vuex.Store<any>): void {
        this.foo = foo.context(store)
      }

      incByTwo(): void {
        this.foo.commit('inc', undefined)
        this.foo.commit('inc', undefined)
      }
    }

    const test = new Module({
      actions: TestActions,
    })

    const root = new Module({
      modules: {
        test,
        foo,
      },
    })

    const store = createStore(root)

    store.dispatch('test/incByTwo')
    expect(store.state.foo.value).toBe(3)
  })

  it('do not produce vuex getter warning with $init', () => {
    jest.spyOn(console, 'error')
    const fooSpy = jest.fn()
    const barSpy = jest.fn()

    class FooGetters extends Getters {
      $init() {
        fooSpy()
      }
    }

    class BarGetters extends Getters {
      $init() {
        barSpy()
      }
    }

    const foo = new Module({
      namespaced: false,
      getters: FooGetters,
    })

    const bar = new Module({
      namespaced: false,
      getters: BarGetters,
    })

    const root = new Module({
      modules: {
        foo,
        bar,
      },
    })

    createStore(root)

    expect(fooSpy).toHaveBeenCalled()
    expect(barSpy).toHaveBeenCalled()
    expect(console.error).not.toHaveBeenCalled()
  })

  describe('state initialization', () => {
    interface ConfigObject {
      param_1: number
      param_2: number
    }
    class AlternateStateImplemented implements InitState<ConfigObject> {
      param = 1
      alternate?: string = undefined

      init(config: ConfigObject): void {
        this.param = config.param_2
        this.alternate = 'changed'
      }
    }

    it('model component initializes when initial state interface is implemented', () => {
      class AlternateGetters extends Getters<AlternateStateImplemented> {}
      class AlternateMutations extends Mutations<AlternateStateImplemented> {}
      class AlternateActions extends Actions<
        AlternateStateImplemented,
        AlternateGetters,
        AlternateMutations,
        AlternateActions
      > {}

      const module = new Module<
        AlternateStateImplemented,
        AlternateGetters,
        AlternateMutations,
        AlternateActions
      >({
        state: AlternateStateImplemented,
        actions: AlternateActions,
        getters: AlternateGetters,
        mutations: AlternateMutations,
        initState: {
          param_2: 3,
        },
      })

      const store = createStore(module)
      expect(store.state.param).toBe(3)
      expect(store.state.alternate).toBe('changed')
    })
    it('model component initializes when when initial state interface is not implemented', () => {
      class AlternateStateUnImplemented implements InitState<ConfigObject> {
        param = 1
        alternate?: string = 'unchanged'

        init(_config: ConfigObject): void {
          expect(_config.param_2).toBe(3)
        }
      }

      class AlternateGetters extends Getters<AlternateStateUnImplemented> {}
      class AlternateMutations extends Mutations<AlternateStateUnImplemented> {}
      class AlternateActions extends Actions<
        AlternateStateUnImplemented,
        AlternateGetters,
        AlternateMutations,
        AlternateActions
      > {}

      const module = new Module<
        AlternateStateUnImplemented,
        AlternateGetters,
        AlternateMutations,
        AlternateActions
      >({
        state: AlternateStateUnImplemented,
        actions: AlternateActions,
        getters: AlternateGetters,
        mutations: AlternateMutations,
        initState: {
          param_2: 3,
        },
      })

      const store = createStore(module)
      expect(store.state.param).toBe(1)
      expect(store.state.alternate).toBe('unchanged')
    })
  })
  describe('component mappers', () => {
    const fooModule = new Module({
      state: FooState,
      getters: FooGetters,
      mutations: FooMutations,
      actions: FooActions,
    })

    const root = new Module({
      modules: {
        foo: fooModule,
      },
    })

    const foo = createMapper(fooModule)

    let store: Vuex.Store<any>

    beforeEach(() => {
      store = createStore(root)
    })

    describe('state', () => {
      it('maps state', async () => {
        const Test = defineComponent({
          computed: foo.mapState(['value']),

          render() {
            return h('div', [this.value.toString()])
          },
        }) as any

        const wrapper = shallowMount(Test, {
          global: {
            plugins: [store],
          },
        })

        expect(wrapper.text()).toBe('1')
        store.state.foo.value = 2
        await nextTick()
        expect(wrapper.text()).toBe('2')
      })

      it('maps state with object syntax', async () => {
        const Test = defineComponent({
          computed: foo.mapState({
            test: 'value',
          }),

          render() {
            return h('div', [this.test.toString()])
          },
        })

        const wrapper = shallowMount(Test, {
          global: {
            plugins: [store],
          },
        })

        expect(wrapper.text()).toBe('1')
        store.state.foo.value = 2
        await nextTick()
        expect(wrapper.text()).toBe('2')
      })

      it('maps state with mapper function', async () => {
        const Test = defineComponent({
          computed: foo.mapState({
            value: (state, getters) => {
              return state.value + getters.double
            },
          }),

          render() {
            return h('div', [this.value.toString()])
          },
        })

        const wrapper = shallowMount(Test, {
          global: {
            plugins: [store],
          },
        })

        expect(wrapper.text()).toBe('3')
        store.state.foo.value = 2
        await nextTick()
        expect(wrapper.text()).toBe('6')
      })
    })

    describe('getters', () => {
      it('maps getters', async () => {
        const Test = defineComponent({
          computed: foo.mapGetters(['double']),

          render() {
            return h('div', [this.double.toString()])
          },
        })

        const wrapper = shallowMount(Test, {
          global: {
            plugins: [store],
          },
        })

        expect(wrapper.text()).toBe('2')
        store.state.foo.value = 2
        await nextTick()
        expect(wrapper.text()).toBe('4')
      })

      it('maps getters with object syntax', async () => {
        const Test = defineComponent({
          computed: foo.mapGetters({
            test: 'double',
          }),

          render() {
            return h('div', [this.test.toString()])
          },
        })

        const wrapper = shallowMount(Test, {
          global: {
            plugins: [store],
          },
        })

        expect(wrapper.text()).toBe('2')
        store.state.foo.value = 2
        await nextTick()
        expect(wrapper.text()).toBe('4')
      })
    })

    describe('mutations', () => {
      it('maps mutations', () => {
        const Test = defineComponent({
          methods: foo.mapMutations(['inc']),

          render() {
            return h('div')
          },
        })

        const wrapper = shallowMount(Test, {
          global: {
            plugins: [store],
          },
        })

        const vm: InstanceType<typeof Test> = wrapper.vm
        vm.inc()
        expect(store.state.foo.value).toBe(2)
      })

      it('maps mutations with object syntax', () => {
        const Test = defineComponent({
          methods: foo.mapMutations({
            increment: 'inc',
          }),

          render() {
            return h('div')
          },
        })

        const wrapper = shallowMount(Test, {
          global: {
            plugins: [store],
          },
        })

        const vm: InstanceType<typeof Test> = wrapper.vm
        vm.increment()
        expect(store.state.foo.value).toBe(2)
      })

      it('maps mutations with mapper function', () => {
        const Test = defineComponent({
          methods: foo.mapMutations({
            add: (commit, payload: number) => {
              while (payload > 0) {
                commit('inc', undefined)
                payload--
              }
            },
          }),

          render() {
            return h('div')
          },
        })

        const wrapper = shallowMount(Test, {
          global: {
            plugins: [store],
          },
        })

        const vm: InstanceType<typeof Test> = wrapper.vm
        vm.add(3)
        expect(store.state.foo.value).toBe(4)
      })
    })

    describe('actions', () => {
      it('maps actions', () => {
        const Test = defineComponent({
          methods: foo.mapActions(['inc']),

          render() {
            return h('div')
          },
        })

        const wrapper = shallowMount(Test, {
          global: {
            plugins: [store],
          },
        })

        const vm: InstanceType<typeof Test> = wrapper.vm
        return vm.inc().then(() => {
          expect(store.state.foo.value).toBe(2)
        })
      })

      it('maps actions with object syntax', () => {
        const Test = defineComponent({
          methods: foo.mapActions({
            increment: 'inc',
          }),

          render() {
            return h('div')
          },
        })

        const wrapper = shallowMount(Test, {
          global: {
            plugins: [store],
          },
        })

        const vm: InstanceType<typeof Test> = wrapper.vm
        return vm.increment().then(() => {
          expect(store.state.foo.value).toBe(2)
        })
      })

      it('maps actions with mapper function', () => {
        const Test = defineComponent({
          methods: foo.mapActions({
            add: (dispatch, payload: number) => {
              const p: Promise<unknown>[] = []
              while (payload > 0) {
                p.push(dispatch('inc', undefined))
                payload--
              }
              return Promise.all(p)
            },
          }),

          render() {
            return h('div')
          },
        })

        const wrapper = shallowMount(Test, {
          global: {
            plugins: [store],
          },
        })

        const vm: InstanceType<typeof Test> = wrapper.vm
        return vm.add(3).then(() => {
          expect(store.state.foo.value).toBe(4)
        })
      })
    })
  })
})
