# frozen_string_literal: true

# Local-only file endpoint for the site's dev tools.
#
# `jekyll serve` normally only reads. This adds one POST endpoint,
# /__dev/files, that lets the dev tools in the browser (collection editor,
# the collection picker on photos, the portfolio toggle) read and write a
# small, fixed set of source files in the folder the server runs from. The
# browser can only remember folder access per address (so per port); going
# through the server works the same on any port, with no folder prompt.
#
# It is loaded through the Gemfile (group :jekyll_plugins) because the
# github-pages gem turns on safe mode, which disables _plugins/. GitHub
# Pages itself never runs `jekyll serve`, and ignores this Gemfile.
#
# Guard rails: requests must come from a page served by this same local
# server (custom header + localhost Host/Origin), and only the paths in
# ALLOWED can be touched.

require "json"
require "fileutils"
require "jekyll"
require "jekyll/commands/serve/servlet"

module JekyllDevFiles
  ENDPOINT = "/__dev/files"
  LOCAL_HOSTS = %w(localhost 127.0.0.1 0.0.0.0 ::1 [::1]).freeze

  READ_WRITE = [
    %r!\A_collections/[a-z0-9_]+\.html\z!,
    %r!\A_data/portfolio\.yml\z!,
  ].freeze
  TOUCH_ONLY = [%r!\A[a-z0-9_-]+\.html\z!].freeze

  class Refused < StandardError; end

  class << self
    attr_accessor :source

    def local_host?(host)
      LOCAL_HOSTS.include?(host.to_s.downcase) || host.to_s.downcase.end_with?(".local", ".localhost")
    end

    def check_request!(req)
      raise Refused, "missing X-Dev-Files header" unless req["X-Dev-Files"] == "1"
      raise Refused, "not a local host" unless local_host?(req.host)

      origin = req["Origin"].to_s
      return if origin.empty?

      origin_host = origin.sub(%r!\A[a-z]+://!i, "").sub(%r!:\d+\z!, "")
      raise Refused, "cross-origin request" unless local_host?(origin_host)
    end

    def resolve(path, patterns)
      path = path.to_s
      raise Refused, "path not allowed: #{path}" unless patterns.any? { |p| p.match?(path) }
      raise Refused, "site source unknown" unless source

      File.join(source, path)
    end

    def handle(req)
      check_request!(req)
      body = JSON.parse(req.body.to_s)

      case body["op"]
      when "ping"
        { "ok" => true, "folder" => File.basename(source.to_s) }
      when "read"
        file = resolve(body["path"], READ_WRITE)
        if File.file?(file)
          { "ok" => true, "exists" => true, "content" => File.read(file, :encoding => "UTF-8") }
        else
          { "ok" => true, "exists" => false, "content" => nil }
        end
      when "write"
        file = resolve(body["path"], READ_WRITE)
        content = body["content"]
        raise Refused, "content must be a string" unless content.is_a?(String)

        FileUtils.mkdir_p(File.dirname(file))
        File.write(file, content, :encoding => "UTF-8")
        { "ok" => true }
      when "delete"
        # Collections only; the portfolio data file is never deleted.
        file = resolve(body["path"], [READ_WRITE.first])
        File.delete(file) if File.file?(file)
        { "ok" => true }
      when "touch"
        file = resolve(body["path"], READ_WRITE + TOUCH_ONLY)
        FileUtils.touch(file) if File.file?(file)
        { "ok" => true }
      when "list"
        raise Refused, "site source unknown" unless source

        files = Dir.glob(File.join(source, "_collections", "*.html")).map { |f| File.basename(f, ".html") }.sort
        { "ok" => true, "collections" => files }
      else
        raise Refused, "unknown op"
      end
    end
  end

  # Mixed into Jekyll's WEBrick servlet (which only handles GET/HEAD).
  module Servlet
    def do_POST(req, res) # rubocop:disable Naming/MethodName
      raise WEBrick::HTTPStatus::NotFound unless req.path == ENDPOINT

      res["Content-Type"] = "application/json; charset=utf-8"
      res["Cache-Control"] = "no-store"
      begin
        res.status = 200
        res.body = JSON.generate(JekyllDevFiles.handle(req))
      rescue Refused, JSON::ParserError => e
        res.status = 403
        res.body = JSON.generate("ok" => false, "error" => e.message)
      rescue StandardError => e
        res.status = 500
        res.body = JSON.generate("ok" => false, "error" => e.message)
      end
    end
  end
end

Jekyll::Hooks.register :site, :after_init do |site|
  JekyllDevFiles.source = site.source
end

Jekyll::Commands::Serve::Servlet.include(JekyllDevFiles::Servlet)
