// Serves the MCP endpoint's OAuth protected resource metadata (RFC 9728) from the site root,
// for MCP clients that look here instead of following the 401's link.
import config from '@payload-config'
import { oauthProtectedResourceHandler } from '@payloadcms/plugin-mcp'

export const GET = oauthProtectedResourceHandler({ config })
