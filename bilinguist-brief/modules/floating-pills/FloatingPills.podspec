require 'json'

package = JSON.parse(File.read(File.join(__dir__, 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'FloatingPills'
  s.version        = package['version']
  s.summary        = 'Native liquid glass floating pills for Bilinguist Brief'
  s.description    = 'UIKit overlay with UIGlassEffect pills sitting above the RN layer'
  s.license        = 'MIT'
  s.author         = 'Will Diggle'
  s.homepage       = 'https://github.com/will-diggle/Claude-Routines'
  s.platform       = :ios, '15.1'
  s.swift_version  = '5.9'
  s.ios.deployment_target = '15.1'
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files   = 'ios/**/*.{h,m,mm,swift,hpp,cpp}'
end
