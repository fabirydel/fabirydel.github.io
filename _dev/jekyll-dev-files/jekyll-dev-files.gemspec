# frozen_string_literal: true

Gem::Specification.new do |s|
  s.name        = "jekyll-dev-files"
  s.version     = "0.1.0"
  s.summary     = "Local-only file endpoint for the site's dev tools"
  s.description = "Lets the dev tools (collection editor, collection picker, " \
                  "portfolio toggle) read and write a few source files through " \
                  "`jekyll serve`, so they work on any port without asking the " \
                  "browser for folder access."
  s.authors     = ["Fabian Rydel"]
  s.files       = ["lib/jekyll-dev-files.rb"]
  s.require_paths = ["lib"]
end
