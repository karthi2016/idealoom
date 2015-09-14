from cStringIO import StringIO

import simplejson as json
from pyramid.view import view_config
from pyramid.response import Response
from pyramid.security import authenticated_userid
from pyramid.httpexceptions import HTTPUnauthorized

from assembl.models import JiveGroupSource
from assembl.models.jive.setup import (
    jive_addon_registration_route,
    jive_addon_creation,
    jive_redirect_url,
    create_jive_addon,
)
from assembl.auth import P_READ, Everyone
from assembl.models.auth import AgentProfile
from assembl.auth.util import get_permissions
from ..traversal import InstanceContext
from . import JSON_HEADER


@view_config(context=InstanceContext, request_method='GET',
             ctx_instance_class=AgentProfile, permission=P_READ,
             name=jive_redirect_url)
def get_auth_code_grant(request):
    # https://community.jivesoftware.com/docs/DOC-97348#jive_content_id_Obtaining_an_Access_Token_using_Authorization_Code_Grant
    qs = request.GET
    if 'code' in qs:
        auth_code = qs.get('code')
        # incomplete


@view_config(context=InstanceContext, request_method='GET',
             ctx_instance_class=JiveGroupSource, permission=P_READ,
             renderer='json', name=jive_addon_creation)
def generate_jive_addon(request):
    # Instead of storing the zip file locally, use a StringIO object
    # Add the UUID in a db setting somewhere - look in user_key_values
    ctx = request.context
    user_id = authenticated_userid(request) or Everyone
    permissions = get_permissions(user_id, ctx.get_discussion_id())
    if P_READ not in permissions:
        raise HTTPUnauthorized("Only a registered user can request for\
            this resource. Please sign up to continue")
    # get the full URL here and call create_jive_addon
    output = StringIO()
    zipfile = create_jive_addon(ctx._instance, output)
    output.seek(0)
    return Response(body_file=output, content_type="application/zip")


@view_config(context=InstanceContext, request_method='POST',
             ctx_instance_class=JiveGroupSource, header=JSON_HEADER,
             renderer='json', name=jive_addon_registration_route)
def register_jive_addon(request):
    data = request.json_body
    if not data:
        # TODO: Log this as a failure!
        return {'error': 'There was no discussion sent'}
    ctx = request.context
    source = ctx._instance
    db = JiveGroupSource.default_db

    # TODO: Ensure this is from a genuine Jive instance
    # https://community.jivesoftware.com/docs/DOC-99941
    json_data = json.dumps(data)
    source.settings = json_data
    db.add(source)
    db.flush()  # is this even necessary?
    return {}