import {
  queryToJson,
  getUniqueKey,
  cacheDataSet,
  cacheDataGet
} from '@tarojs/shared'
import { _onAndSyncApis, _noPromiseApis, _otherApis } from './apis-list'

declare const my: any
declare const getCurrentPages: () => any
declare const getApp: () => any

interface ITaro {
  onAndSyncApis: Set<string>
  noPromiseApis: Set<string>
  otherApis: Set<string>
  [propName: string]: any
}

const apiDiff = {
  showActionSheet: {
    options: {
      change: [{
        old: 'itemList',
        new: 'items'
      }]
    }
  },
  showToast: {
    options: {
      change: [{
        old: 'title',
        new: 'content'
      }, {
        old: 'icon',
        new: 'type'
      }]
    }
  },
  showLoading: {
    options: {
      change: [{
        old: 'title',
        new: 'content'
      }]
    }
  },
  setNavigationBarTitle: {
    alias: 'setNavigationBar'
  },
  setNavigationBarColor: {
    alias: 'setNavigationBar'
  },
  saveImageToPhotosAlbum: {
    alias: 'saveImage',
    options: {
      change: [{
        old: 'filePath',
        new: 'url'
      }]
    }
  },
  previewImage: {
    options: {
      set: [{
        key: 'current',
        value (options) {
          return options.urls.indexOf(options.current || options.urls[0])
        }
      }]
    }
  },
  getFileInfo: {
    options: {
      change: [{
        old: 'filePath',
        new: 'apFilePath'
      }]
    }
  },
  getSavedFileInfo: {
    options: {
      change: [{
        old: 'filePath',
        new: 'apFilePath'
      }]
    }
  },
  removeSavedFile: {
    options: {
      change: [{
        old: 'filePath',
        new: 'apFilePath'
      }]
    }
  },
  saveFile: {
    options: {
      change: [{
        old: 'tempFilePath',
        new: 'apFilePath'
      }]
    }
  },
  openLocation: {
    options: {
      set: [{
        key: 'latitude',
        value (options) {
          return String(options.latitude)
        }
      }, {
        key: 'longitude',
        value (options) {
          return String(options.longitude)
        }
      }]
    }
  },
  uploadFile: {
    options: {
      change: [{
        old: 'name',
        new: 'fileName'
      }]
    }
  },
  getClipboardData: {
    alias: 'getClipboard'
  },
  setClipboardData: {
    alias: 'setClipboard',
    options: {
      change: [{
        old: 'data',
        new: 'text'
      }]
    }
  },
  makePhoneCall: {
    options: {
      change: [{
        old: 'phoneNumber',
        new: 'number'
      }]
    }
  },
  scanCode: {
    alias: 'scan',
    options: {
      change: [{
        old: 'onlyFromCamera',
        new: 'hideAlbum'
      }],
      set: [{
        key: 'type',
        value (options) {
          return (options.scanType && options.scanType[0].slice(0, -4)) || 'qr'
        }
      }]
    }
  },
  setScreenBrightness: {
    options: {
      change: [{
        old: 'value',
        new: 'brightness'
      }]
    }
  },
  onBLEConnectionStateChange: {
    alias: 'onBLEConnectionStateChanged'
  },
  offBLEConnectionStateChange: {
    alias: 'offBLEConnectionStateChanged'
  },
  createBLEConnection: {
    alias: 'connectBLEDevice'
  },
  closeBLEConnection: {
    alias: 'disconnectBLEDevice'
  }
}

const nativeRequest = my.canIUse('request') ? my.request : my.httpRequest

const RequestQueue = {
  MAX_REQUEST: 5,
  queue: [],
  request (options) {
    this.push(options)
    // 返回request task
    return this.run()
  },

  push (options) {
    this.queue.push(options)
  },

  run () {
    if (!this.queue.length) {
      return
    }
    if (this.queue.length <= this.MAX_REQUEST) {
      const options = this.queue.shift()
      const completeFn = options.complete
      options.complete = () => {
        completeFn && completeFn.apply(options, [...arguments])
        this.run()
      }
      return nativeRequest(options)
    }
  }
}

function taroInterceptor (chain) {
  return request(chain.requestParams)
}

function request (options) {
  options = options || {}
  if (typeof options === 'string') {
    options = {
      url: options
    }
  }
  const defaultHeaders = {
    'content-type': 'application/json'
  }
  options.headers = defaultHeaders
  if (options.header) {
    for (const k in options.header) {
      const lowerK = k.toLocaleLowerCase()
      options.headers[lowerK] = options.header[k]
    }
    delete options.header
  }
  const originSuccess = options.success
  const originFail = options.fail
  const originComplete = options.complete
  let requestTask
  const p: any = new Promise((resolve, reject) => {
    options.success = res => {
      res.statusCode = res.status
      delete res.status
      res.header = res.headers
      delete res.headers
      originSuccess && originSuccess(res)
      resolve(res)
    }
    options.fail = res => {
      originFail && originFail(res)
      reject(res)
    }

    options.complete = res => {
      originComplete && originComplete(res)
    }

    requestTask = RequestQueue.request(options)
  })
  p.abort = (cb) => {
    cb && cb()
    if (requestTask) {
      requestTask.abort()
    }
    return p
  }
  return p
}

function processApis (taro: ITaro) {
  const onAndSyncApis = new Set([...taro.onAndSyncApis, ..._onAndSyncApis])
  const noPromiseApis = new Set([...taro.noPromiseApis, ..._noPromiseApis])
  const otherApis = new Set([...taro.otherApis, ..._otherApis])
  const apis = [...onAndSyncApis, ...noPromiseApis, ...otherApis]
  const preloadPrivateKey = '__preload_'
  const preloadInitedComponent = '$preloadComponent'
  apis.forEach(key => {
    if (!(key in my)) {
      taro[key] = () => {
        console.warn(`支付宝小程序暂不支持 ${key}`)
      }
      return
    }

    if (otherApis.has(key)) {
      taro[key] = (options, ...args) => {
        const result = generateSpecialApis(key, options || {})
        const newKey = result.api
        options = result.options
        let task: any = null
        const obj = Object.assign({}, options)
        if (!(newKey in my)) {
          console.warn(`支付宝小程序暂不支持 ${newKey}`)
          return
        }
        if (typeof options === 'string') {
          if (args.length) {
            return my[newKey](options, ...args)
          }
          return my[newKey](options)
        }

        if (key === 'navigateTo' || key === 'redirectTo' || key === 'switchTab') {
          let url = obj.url ? obj.url.replace(/^\//, '') : ''
          if (url.indexOf('?') > -1) url = url.split('?')[0]

          const Component = cacheDataGet(url)
          if (Component) {
            const component = new Component()
            if (component.componentWillPreload) {
              const cacheKey = getUniqueKey()
              const MarkIndex = obj.url.indexOf('?')
              const hasMark = MarkIndex > -1
              const urlQueryStr = hasMark ? obj.url.substring(MarkIndex + 1, obj.url.length) : ''
              const params = queryToJson(urlQueryStr)
              obj.url += (hasMark ? '&' : '?') + `${preloadPrivateKey}=${cacheKey}`
              cacheDataSet(cacheKey, component.componentWillPreload(params))
              cacheDataSet(preloadInitedComponent, component)
            }
          }
        }

        const p: any = new Promise((resolve, reject) => {
          ['fail', 'success', 'complete'].forEach((k) => {
            obj[k] = (res) => {
              if (k === 'success') {
                if (newKey === 'saveFile') {
                  res.savedFilePath = res.apFilePath
                } else if (newKey === 'downloadFile') {
                  res.tempFilePath = res.apFilePath
                } else if (newKey === 'chooseImage') {
                  res.tempFilePaths = res.apFilePaths
                } else if (newKey === 'getClipboard') {
                  res.data = res.text
                } else if (newKey === 'scan') {
                  res.result = res.code
                } else if (newKey === 'getScreenBrightness') {
                  res.value = res.brightness
                  delete res.brightness
                }
              }
              options[k] && options[k](res)
              if (k === 'success') {
                resolve(res)
              } else if (k === 'fail') {
                reject(res)
              }
            }
          })
          if (args.length) {
            task = my[newKey](obj, ...args)
          } else {
            task = my[newKey](obj)
          }
        })
        if (newKey === 'uploadFile' || newKey === 'downloadFile') {
          p.progress = cb => {
            if (task) {
              task.onProgressUpdate(cb)
            }
            return p
          }
          p.abort = cb => {
            cb && cb()
            if (task) {
              task.abort()
            }
            return p
          }
        }
        return p
      }
    } else {
      taro[key] = (...args) => {
        if (!(key in my)) {
          console.warn(`支付宝小程序暂不支持 ${key}`)
          return
        }
        if (key === 'getStorageSync') {
          const arg1 = args[0]
          if (arg1 != null) {
            const res = my[key]({ key: arg1 })

            // 支付宝小程序遗留bug：值可能在data或APDataStorage字段下
            let data = null
            if (res.hasOwnProperty('data')) {
              data = res.data
            } else if (res.hasOwnProperty('APDataStorage')) {
              data = res.APDataStorage
            }

            return data === null ? '' : data
          }
          return console.error('getStorageSync 传入参数错误')
        }
        if (key === 'setStorageSync') {
          const arg1 = args[0]
          const arg2 = args[1]
          if (arg1 != null) {
            return my[key]({
              key: arg1,
              data: arg2
            })
          }
          return console.error('setStorageSync 传入参数错误')
        }
        if (key === 'removeStorageSync') {
          const arg1 = args[0]
          if (arg1 != null) {
            return my[key]({ key: arg1 })
          }
          return console.error('removeStorageSync 传入参数错误')
        }
        if (key === 'createSelectorQuery') {
          const query = my[key]()
          query.in = function () { return query }
          return query
        }
        const argsLen = args.length
        const newArgs = args.concat()
        const lastArg = newArgs[argsLen - 1]
        if (lastArg && lastArg.isTaroComponent && lastArg.$scope) {
          newArgs.splice(argsLen - 1, 1, lastArg.$scope)
        }
        return my[key].apply(my, newArgs)
      }
    }
  })
}

function pxTransform (size) {
  const {
    designWidth = 750,
    deviceRatio = {
      640: 2.34 / 2,
      750: 1,
      828: 1.81 / 2
    }
  } = this.config || {}
  if (!(designWidth in deviceRatio)) {
    throw new Error(`deviceRatio 配置中不存在 ${designWidth} 的设置！`)
  }
  return (parseInt(size, 10) * deviceRatio[designWidth]) + 'rpx'
}

function generateSpecialApis (api, options) {
  let apiAlias = api
  if (api === 'showModal') {
    options.cancelButtonText = options.cancelText || '取消'
    options.confirmButtonText = options.confirmText || '确定'
    apiAlias = 'confirm'
    if (options.showCancel === false) {
      options.buttonText = options.confirmText || '确定'
      apiAlias = 'alert'
    }
  } else {
    Object.keys(apiDiff).forEach(item => {
      const apiItem = apiDiff[item]
      if (api === item) {
        if (apiItem.alias) {
          apiAlias = apiItem.alias
        }
        if (apiItem.options) {
          const change = apiItem.options.change
          const set = apiItem.options.set
          if (change) {
            change.forEach(changeItem => {
              options[changeItem.new] = options[changeItem.old]
            })
          }
          if (set) {
            set.forEach(setItem => {
              options[setItem.key] = typeof setItem.value === 'function' ? setItem.value(options) : setItem.value
            })
          }
        }
      }
    })
  }

  return {
    api: apiAlias,
    options
  }
}

export function initNativeApi (taro) {
  processApis(taro)
  const link = new taro.Link(taroInterceptor)
  taro.request = link.request.bind(link)
  taro.addInterceptor = link.addInterceptor.bind(link)
  taro.cleanInterceptors = link.cleanInterceptors.bind(link)
  taro.getCurrentPages = getCurrentPages
  taro.getApp = getApp
  taro.initPxTransform = taro.initPxTransform.bind(taro)
  taro.pxTransform = pxTransform.bind(taro)
  taro.env = my.env
}