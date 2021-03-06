""" App URL routing and renderers are configured in this module. 

Note that Assembl is a `hybrid app`_, and combines routes and :py:mod:`traversal`.

.. _`hybrid app`: http://docs.pylonsproject.org/projects/pyramid/en/latest/narr/hybrid.html
"""

import os.path
import codecs
from collections import defaultdict

import simplejson as json
from pyramid.view import view_config
from pyramid.response import Response
from social.exceptions import AuthMissingParameter
from pyramid.httpexceptions import (
    HTTPException, HTTPInternalServerError, HTTPMovedPermanently,
    HTTPBadRequest, HTTPFound, HTTPTemporaryRedirect as HTTPTemporaryRedirectP)
from pyramid.i18n import TranslationStringFactory
from pyramid.settings import asbool, aslist

from ..lib.json import json_renderer_factory
from ..lib import config
from ..lib.frontend_urls import FrontendUrls
from ..lib.locale import get_language, get_country
from ..lib.utils import get_global_base_url
from ..lib.raven_client import capture_exception
from ..auth import R_PARTICIPANT

default_context = {
}


TEMPLATE_PATH = os.path.join(
    os.path.dirname(os.path.dirname(__file__)), 'templates')


class HTTPTemporaryRedirect(HTTPTemporaryRedirectP):
    def __init__(self, *args, **kwargs):
        kwargs["cache_control"] = "no-cache"
        super(HTTPTemporaryRedirect, self).__init__(*args, **kwargs)
        self.cache_control.prevent_auto = True


def backbone_include(config):
    FrontendUrls.register_frontend_routes(config)
    config.add_route('styleguide', '/styleguide')
    config.add_route('test', '/test')

def get_theme_base_path():
    theme_base_path = os.path.join(os.path.dirname(os.path.dirname(__file__)),
                              'static', 'css', 'themes')
    return theme_base_path

def find_theme(theme_name):
    """
    Recursively looks for a theme with the provided name in the theme path folder
    @returns the theme path fragment relative to the theme base_path, or 
    None if not found
    """
    theme_base_path = get_theme_base_path()

    walk_results = os.walk(theme_base_path, followlinks=True)
    for (dirpath, dirnames, filenames) in walk_results:
        if '_theme.scss' in filenames:
            #print repr(dirpath), repr(dirnames) , repr(filenames)
            relpath = os.path.relpath(dirpath, theme_base_path)
            (head, name) = os.path.split(dirpath)
            print name, relpath
            if name == theme_name:
                return relpath

    return None

def get_theme_info(discussion):
    """
    @return (theme_name, theme_relative_path) the relative path is relative to the theme_base_path.  See find_theme.
    """
    theme_name = config.get('default_theme') or 'default'
    theme_path = None
    if discussion:
        # Legacy code: Slug override
        theme_path = find_theme(discussion.slug)
    if theme_path:
        theme_name = discussion.slug
    else:
        theme_path = find_theme(theme_name)
    if theme_path is not None:
        return (theme_name, theme_path)
    else:
        return ('default', 'default')


def get_providers_with_names(providers=None):
    from ..models.auth import IdentityProvider
    if providers is None:
        providers = aslist(config.get('login_providers'))
    provider_names = dict(IdentityProvider.default_db.query(
        IdentityProvider.provider_type, IdentityProvider.name).all())
    providers = {pr: provider_names[pr] for pr in providers}
    if 'saml' in providers:
        del providers['saml']
        saml_providers = config.get('SOCIAL_AUTH_SAML_ENABLED_IDPS')
        if not isinstance(saml_providers, dict):
            saml_providers = json.loads(saml_providers)
        for prov_id, data in saml_providers.iteritems():
            providers['saml:' + prov_id] = data["description"]
    return providers


def get_default_context(request):
    from ..auth.util import get_user, get_current_discussion
    if request.scheme == "http"\
            and asbool(config.get("require_secure_connection")):
        raise HTTPFound("https://" + request.host + request.path_qs)
    socket_proxied = asbool(config.get('changes.websocket.proxied'))
    websocket_port = None if socket_proxied \
        else config.get('changes.websocket.port')
    secure_socket = socket_proxied and (
        asbool(config.get("require_secure_connection"))
        or (asbool(config.get("accept_secure_connection"))
            and request.url.startswith('https:')))
    socket_url = get_global_base_url(
        secure_socket, websocket_port) + config.get('changes.prefix')

    localizer = request.localizer
    _ = TranslationStringFactory('assembl')
    user = get_user(request)
    if user and user.username:
        user_profile_edit_url = request.route_url(
            'profile_user', type='u', identifier=user.username.username)
    elif user:
        user_profile_edit_url = request.route_url(
            'profile_user', type='id', identifier=user.id)
    else:
        user_profile_edit_url = None

    web_analytics_piwik_script = config.get(
        'web_analytics_piwik_script') or False
    discussion = get_current_discussion()
    if (web_analytics_piwik_script and discussion
            and discussion.web_analytics_piwik_id_site):
        web_analytics_piwik_script = web_analytics_piwik_script % (
            discussion.web_analytics_piwik_id_site,
            discussion.web_analytics_piwik_id_site)
    else:
        web_analytics_piwik_script = False

    web_analytics_piwik_custom_variable_size = config.get('web_analytics_piwik_custom_variable_size')
    if not web_analytics_piwik_custom_variable_size:
        web_analytics_piwik_custom_variable_size = 5

    help_url = config.get('help_url') or ''
    if discussion and discussion.help_url:
        help_url = discussion.help_url
    if help_url and "%s" in help_url:
        help_url = help_url % localizer.locale_name

    first_login_after_auto_subscribe_to_notifications = False
    if (user and discussion and discussion.id and user.is_first_visit
            and discussion.subscribe_to_notifications_on_signup
            and user.has_role_in(discussion, R_PARTICIPANT)):
        first_login_after_auto_subscribe_to_notifications = True
    locales = config.get('available_languages').split()
    countries_for_locales = defaultdict(set)
    for locale in locales:
        countries_for_locales[get_language(locale)].add(get_country(locale))
    show_locale_country = {
        locale: (len(countries_for_locales[get_language(locale)]) > 1)
        for locale in locales}
    jedfilename = os.path.join(
            os.path.dirname(__file__), '..', 'locale',
            localizer.locale_name, 'LC_MESSAGES', 'assembl.jed.json')
    if not os.path.exists(jedfilename) and '_' in localizer.locale_name:
        jedfilename = os.path.join(
            os.path.dirname(__file__), '..', 'locale',
            get_language(localizer.locale_name), 'LC_MESSAGES',
            'assembl.jed.json')
    assert os.path.exists(jedfilename)
    providers = get_providers_with_names()

    from ..models.facebook_integration import language_sdk_existance
    fb_lang_exists, fb_locale = language_sdk_existance(get_language(localizer.locale_name),
                                                    countries_for_locales)

    def process_export_list(ls):
        import string
        return map(lambda s: s.strip(), ls.split(","))

    social_settings = {
        'fb_export_permissions': config.get('facebook.export_permissions'),
        'fb_debug': asbool(config.get('facebook.debug_mode')),
        'fb_app_id': config.get('facebook.consumer_key'),
        'fb_api_version': config.get('facebook.api_version') or '2.2',
        'supported_exports': process_export_list(
            config.get('supported_exports_list'))
    }

    # A container for all analytics related settings. All future
    # analytics based settings that will be exposed to the templates
    # should be included in this dictionary
    analytics_settings = {
        'enabled': True if web_analytics_piwik_script else False,
    }

    if analytics_settings.get('enabled', False):
        analytics_settings['piwik'] = {
            'script': web_analytics_piwik_script
        }

    use_webpack_server = asbool(config.get("use_webpack_server"))
    static_url = '/static'
    widget_url = '/static/widget'
    if use_webpack_server:
        static_url = 'http://%s:%d' % (
            config.get('public_hostname', 'localhost'),
            int(config.get('webpack_port', 8080)))

    (theme_name, theme_relative_path)=get_theme_info(discussion)
    return dict(
        default_context,
        STATIC_URL=static_url,
        WIDGET_URL=widget_url,
        request=request,
        user=user,
        templates=get_template_views(),
        discussion=discussion or {},  # Templates won't load without a discussion object
        preferences=discussion.preferences if discussion else {},
        user_profile_edit_url=user_profile_edit_url,
        locale=localizer.locale_name,
        locales=locales,
        fb_lang_exists=fb_lang_exists,
        fb_locale=fb_locale,
        social_settings=social_settings,
        show_locale_country=show_locale_country,
        theme_name=theme_name,
        theme_relative_path=theme_relative_path,
        minified_js=config.get('minified_js') or False,
        platform_name=config.get('platform_name') or "Assembl",
        web_analytics=analytics_settings,
        help_url=help_url,
        socket_url=socket_url,
        first_login_after_auto_subscribe_to_notifications=first_login_after_auto_subscribe_to_notifications,
        raven_url=config.get('raven_url') or '',
        activate_tour=str(config.get('activate_tour') or False).lower(),
        providers=json.dumps(providers),
        translations=codecs.open(jedfilename, encoding='utf-8').read()
        )


def get_template_views():
    """ get all .tmpl files from templates/views directory """
    views_path = os.path.join(TEMPLATE_PATH, 'views')
    views = []

    for (dirpath, dirname, filenames) in os.walk(views_path):
        for filename in filenames:
            if filename.endswith('.tmpl'):
                views.append(filename.split('.')[0])

    return views


class JSONError(HTTPException):
    content_type = 'text/plain'

    def __init__(self, code, detail=None, headers=None, comment=None,
                 body_template=None, **kw):
        self.code = code
        self.content_type = 'text/plain'
        super(JSONError, self).__init__(
            detail, headers, comment,
            body='{"error":"%s", "status":%d}' % (detail, code), **kw)

        def prepare(self, environ):
            r = super(JSONError, self).prepare(environ)
            self.content_type = 'text/plain'
            return r


# TODO social_auth: Test the heck out of this.
@view_config(context=AuthMissingParameter)
def csrf_error_view(exc, request):
    if "HTTP_COOKIE" not in request.environ:
        user_agent = request.user_agent
        is_safari = 'Safari' in user_agent and 'Chrome' not in user_agent
        route_name = request.matched_route.name
        is_login_callback = (route_name == 'social.complete')
        if is_safari and is_login_callback:
            # This is an absolutely horrible hack, but depending on some settings,
            # Safari does not give cookies on a redirect, so we lose session info.
            if 'reload' not in request.GET:
                # So first make sure the new session does not kill the old one
                def callback(request, response):
                    response._headerlist = [(h, v) for (h, v) in response._headerlist if h != 'Set-Cookie']
                    print "headerlist:", response._headerlist
                request.add_response_callback(callback)
                # And return a page that will reload the same request, NOT through a 303.
                # Also add a "reload" parameter to avoid doing it twice if it failed.
                template = ('<html><head><script>document.location = "' +
                    request.path_info + '?' + request.query_string +
                    '&reload=true"</script></head></html>')
                return Response(template, content_type='text/html')
            else:
                # The hack failed. Tell the user what to do.
                return HTTPBadRequest(explanation="Missing cookies", detail="""Note that we need active cookies.
                    On Safari, the "Allow from current website only" option
                    in the Privacy tab of preferences is too restrictive;
                    use "Allow from websites I visit" and try again. Simply reloading may work.""")
        return HTTPBadRequest(explanation="Missing cookies", detail=repr(request.exception))
    return  HTTPBadRequest(explanation="CSRF error", detail=repr(request.exception))


def error_view(exc, request):
    # from traceback import format_exc
    from datetime import datetime
    capture_exception(getattr(request, "exc_info", None))
    return HTTPInternalServerError(
        explanation="Sorry, Assembl had an internal issue and you have to reload. Please send this to a discussion administrator.",
        detail=datetime.utcnow().isoformat()+"\n"+repr(request.exception))
        # format_exc(request.exception))


def redirector(request):
    return HTTPMovedPermanently(request.route_url(
        'home', discussion_slug=request.matchdict.get('discussion_slug')))


def includeme(config):
    """ Initialize views and renderers at app start-up time. """

    settings = config.get_settings()

    config.add_renderer('json', json_renderer_factory)
    config.include('.traversal')

    default_discussion = settings.get('default_discussion', None)
    if default_discussion:
        config.add_route('discussion_list', '/discussions')
        config.add_view(
            lambda req: HTTPFound('/'+default_discussion),
            route_name='default_disc_redirect')

        config.add_route('default_disc_redirect', '/')
    else:
        config.add_route('discussion_list', '/')

    config.include(backbone_include, route_prefix='/{discussion_slug}')

    if asbool(config.get_settings().get('assembl_handle_exceptions', 'true')):
        config.add_view(error_view, context=Exception)

    #  authentication
    config.include('.auth')

    config.include('.api')
    config.include('.api2')

    config.include('.discussion_list')
    config.include('.admin')

    config.add_route('home-auto', '/{discussion_slug}/')

    config.add_view(redirector, route_name='home-auto')
    default_context['cache_bust'] = \
        config.registry.settings['requirejs.cache_bust']

    # Scan now, to get cornice views
    config.scan('.')
    # make sure this comes last to avoid conflicts
    config.add_route('home', '/{discussion_slug}')
