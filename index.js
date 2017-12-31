var path = require('path')
var Stream = require('stream')
var PluginError = require('plugin-error')
var Vinyl = require('vinyl')
var _ = require('lodash')
var phridge = require('phridge')
var fs = require('fs')

var SPRITE_TEMPLATE = path.join(__dirname, 'templates', 'sprite.html')

module.exports = function (options) {

  var svgs = {}
  var fileName
  var opts = _.extend({
    cssTemplate: path.join(__dirname, 'templates', 'style.css')
  , backgroundUrl: false
  , spriteWidth: 400
  }, options)
  var stream = new Stream.Transform({objectMode: true})

  stream._transform = function transform (file, encoding, cb) {
    if (file.isStream()) {
      return cb(new PluginError('gulp-svgfallback', 'Streams are not supported!'))
    }

    var name = path.basename(file.relative, path.extname(file.relative))

    if (!fileName) {
      fileName = path.basename(file.base)
      if (fileName === '.' || !fileName) {
        fileName = 'svgfallback'
      } else {
        fileName = fileName.split(path.sep).shift()
      }
    }

    if (name in svgs) {
      return cb(new PluginError('gulp-svgfallback', 'File name should be unique: ' + name))
    }

    svgs[name] = file.contents.toString()
    cb()
  }

  stream._flush = function flush (cb) {

    var self = this

    if (Object.keys(svgs).length === 0) return cb()

    renderTemplate(SPRITE_TEMPLATE, {icons: svgs})
      .then(function (html) {
        return { html: html, spriteWidth: opts.spriteWidth }
      })
      .then(generateSprite)
      .then(function (sprite) {
        self.push(new Vinyl({
          path: fileName + '.png'
        , contents: new Buffer(sprite.img, 'base64')
        }))

        return renderTemplate(opts.cssTemplate, {
          backgroundUrl: opts.backgroundUrl || fileName + '.png'
        , icons: sprite.icons
        })

      })
      .then(
        function (css) {
          self.push(new Vinyl({
            path: fileName + '.css'
          , contents: new Buffer(css)
          }))
          cb()
        }
      , function (err) {
          setImmediate(function () {
            cb(new PluginError('gulp-svgfallback', err))
          })
        }
      )
  }

  return stream;
}


function renderTemplate (fileName, options) {
  return new Promise(function (resolve, reject) {
    fs.readFile(fileName, function (err, template) {
      if (err) return reject(err)
      try {
        resolve(_.template(template)(options))
      } catch (err) {
        reject(err)
      }
    })
  })
}


function generateSprite (opts) {
  return phridge.spawn()
    .then(function (phantom) {
      return phantom
        .run(opts, phantomScript)
            .then(function (res) {
                phantom.dispose();
                return res;
            }, phantom.dispose.bind(phantom))
    })
}


function phantomScript (opts, resolve) {
  var page = webpage.create()  // jshint ignore: line
  var icons
  page.viewportSize = { width: opts.spriteWidth, height: 1 }
  page.content = opts.html
  page.clipRect = page.evaluate(function () {
    return document.querySelector('.icons').getBoundingClientRect()
  })
  icons = page.evaluate(function () {
    var all = document.querySelectorAll('.icon')
    return [].map.call(all, function (el) {
      var rect = el.getBoundingClientRect()
      return { name: el.getAttribute('data-name')
             , width: rect.width
             , height: rect.height
             , left: rect.left
             , top: rect.top
             }
    })
  })
  resolve({ img: page.renderBase64('PNG'), icons: icons })
}
