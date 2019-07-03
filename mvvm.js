// 声明一个MVVM类
class MVVM{
  constructor (options) {
    debugger
    this.$el = options.el
    this.$data = options.data
    let computed = options.computed
    let methods = options.methods
    if (this.$el) { // 判断el是否存在
      // 把数据全部转化成object.defineProperty来进行getter-setter,进行数据劫持
      new Observer(this.$data)
      // 把computed的值代理到this上，这样就可以直接访问this.$data
      // 取值的时候直接运行计算方法
      for(let key in computed) {
        Object.defineProperty(this.$data, key, {
          get: () => {
            return computed[key].call(this)
          }
        })
      }
      for (let key in methods) {
        Object.defineProperty(this, key, {
          get() {
            return methods[key]
          }
        })
      }
      this.proxyData(this.$data)
      // 模板编译
      new Compiler(this.$el, this)

    }
  }
  proxyData(data) {
    for (let key in data) { // eg:{a:{a1, a2}}
      Object.defineProperty(this, key, {
        get() {
          // 进行转化操作
          return data[key]
        },
        set(newVal) {
          data[key] = newVal
        }
      })
    }
  }
}
// 工具方法集合
var resolveUtil = {
  // 根据表达式取对应的数据
  getValue(vm, expr) {
    return expr.split('.').reduce((data, current) => {
      return data[current.trim()]
    }, vm.$data)
  },
  setValue(vm, expr, value) {
    expr.split('.').reduce((data, current, index, arr) => {
      if(index == arr.length - 1) {
        return data[current] = value
      }
      return data[current]
    }, vm.$data)
  },
  // 解析v-model
  model(node, expr, vm) {
    new Watcher(vm, expr, (newVal) => {
      node.value = newVal
    })
    node.addEventListener('input', (e) => {
        let value = e.target.value
        this.setValue(vm, expr, value)
    });
    let value  = this.getValue(vm, expr)
    node.value = value
  },
  // 解析v-on:click="handlerClick"
  on(node, expr, vm, eventName) {
    node.addEventListener(eventName, e => {
      vm[expr].call(vm, e)
    })
  },
  // 解析v-text {{}}
  text(node, exp, vm) {
    let reg = /\{\{(.+?)\}\}/
    let expr = exp.match(reg)
    let value = this.getValue(vm, expr[1])
    node.textContent = exp.replace(reg, value)
    new Watcher(vm, expr[1], () => {
      let value2 = this.getValue(vm, expr[1])
      node.textContent = exp.replace(reg, value2)
    });
  },
  // 解析v-html
  html(node, expr, vm) {
    new Watcher(vm, expr, newVal => {
      node.innerHTML = newVal
    })
    let value  = this.getValue(vm, expr)
    node.innerHTML = value
  }
}
// 实现数据劫持功能
class Observer{
  constructor (data) {
    this.observer(data)
  }
  observer(data) {
    if (data && typeof data === 'object') {
      if (Array.isArray(data)) {
        data.forEach(item => {
          this.observer(item)
        })
        return false
      }
      for (let key in data) {
        this.defineReactive(data, key, data[key])
      }
    }
  }
  defineReactive(obj, key, val) {
    this.observer(val)
    let dep = new Dep() // 给每个属性添加订阅发布
    Object.defineProperty(obj, key, {
      get() {
        // 判断是否需要添加Watcher，收集依赖
        Dep.target && dep.addSub(Dep.target)
        return val
      },
      set: newVal => {
        if (newVal != val) {
          this.observer(newVal) // 观察新设置的值
          val = newVal
          dep.notify() // 发布
        }
      }
    })
  }
}
// 订阅发布
class Dep {
  constructor() {
    this.subs = [] // 存放所有的watcher
  }
  // 订阅
  addSub(watcher) {
    this.subs.push(watcher)
  }
  // 发布
  notify() {
    this.subs.forEach(watcher => watcher.update())
  }
}
// new Watcher
class Watcher {
  constructor(vm, expr, cb) {
    this.vm = vm // 实例
    this.expr = expr // 观察数据的表达式
    this.cb = cb // 触发更新的回调
    // 存放旧值
    this.oldVal = this.get()
  }
  get() {
    Dep.target = this // 设置自己在this上
    let value = resolveUtil.getValue(this.vm, this.expr)
    Dep.target = null // 使用后重置
    return value
  }
  update() {
    let newVal = resolveUtil.getValue(this.vm, this.expr)
    if (newVal !== this.oldVal) {
      this.cb(newVal)
    }
  }
}

// 编译
class Compiler{
  constructor(el, vm) {
    // 判断el属性
    this.el = this.isElementNode(el) ? el: document.querySelector(el)
    this.vm = vm;
    // 把当前节点放到内存中
    let fragment = this.createFragment(this.el)
    // 把节点内容进行替换
    // 编译成可以渲染的数据
    this.compile(fragment)
    // 把编译好的内容放回dom
    this.el.appendChild(fragment)

  }
  // 是否元素节点
  isElementNode(node) {
    return node.nodeType === 1
  }
  createFragment(el) {
    let fragment = document.createDocumentFragment()
    let firstChild
    while (firstChild = el.firstChild) {
      fragment.appendChild(firstChild)
    }
    return fragment
  }
  // 核心编译方法
  compile(node) {
    let childNodes = node.childNodes;
    [...childNodes].forEach(child => {
      if(this.isElementNode(child)) { // 是否元素节点
        this.compile(child)
        let attributes = child.attributes; // 类数组
        if (attributes) {
          [...attributes].forEach(attr => { // type="text" v-model="a.m"
              let { name, value:expr } = attr // v-model="a.b"
              // 判断是不是指令 //v-
              if(this.isDirective(name)){ // v-model v-html v-bind
                  let [,directive]  = name.split('-');  // v-on:click
                  let [directiveName, eventName] = directive.split(':')
                  // 需要调用不同的指令来处理
                  resolveUtil[directiveName](node,expr,this.vm,eventName)
              }
          })
        }
      } else { // 编译文本
        this.compileText(child)
      }
    })
  }
  // 编译文本
  compileText(node) {
    let content = node.textContent;
    if(/\{\{(.+?)\}\}/.test(content)) { // 判断是否有模板语法

        // 文本节点
        resolveUtil.text(node, content.trim(), this.vm); // {{a}} {{b}}替换文本
    }
  }
  isDirective(name) {
    return name.startsWith('v-')
  }
}
