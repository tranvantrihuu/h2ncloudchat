import os
from flask import Flask, render_template, request, redirect, session, jsonify, flash
import pyrebase
import firebase_admin
from firebase_admin import credentials, firestore
from dotenv import load_dotenv
import cloudinary
import cloudinary.uploader
from flask import render_template
from firebase_admin import db
load_dotenv()

app = Flask(__name__)
app.secret_key = 'your_secret_key'

firebaseConfig = {
    'apiKey': os.getenv('FIREBASE_API_KEY'),
    'authDomain': os.getenv('FIREBASE_AUTH_DOMAIN'),
    'databaseURL': os.getenv('FIREBASE_DATABASE_URL'),
    'storageBucket': os.getenv('FIREBASE_STORAGE_BUCKET')
}

firebase = pyrebase.initialize_app(firebaseConfig)
auth = firebase.auth()
db = firebase.database()
storage = firebase.storage()
cred = credentials.Certificate("serviceAccountKey.json")
firebase_admin.initialize_app(cred)
firestore_db = firestore.client()

cloudinary.config(
    cloud_name=os.getenv('CLOUDINARY_CLOUD_NAME'),
    api_key=os.getenv('CLOUDINARY_API_KEY'),
    api_secret=os.getenv('CLOUDINARY_API_SECRET')
)

@app.route('/')
def home():
    return render_template('home.html')

@app.route('/register')
def register():
    return render_template('register.html')

@app.route('/signup', methods=['POST'])
def signup():
    email = request.form['email']
    password = request.form['password']
    name = request.form['name']
    birth = request.form['birth']
    gender = request.form['gender']
    avatar = request.files.get('avatar')
    username = email.split('@')[0]

    try:
        # Tạo user trên Firebase Auth
        user = auth.create_user_with_email_and_password(email, password)
        uid = user['localId']

        # Upload avatar lên Cloudinary (nếu có)
        avatar_url = ''
        if avatar:
            upload_result = cloudinary.uploader.upload(avatar, folder='avatars')
            avatar_url = upload_result['secure_url']

        # Lưu thông tin vào Firestore, kèm role = 'user'
        firestore_db.collection('users').document(uid).set({
            'email': email,
            'name': name,
            'birth': birth,
            'gender': gender,
            'username': username,
            'avatar': avatar_url,
            'role': 'user'
        })

        # Lưu thông tin vào Realtime Database, kèm role = 'user'
        db.child("users").child(uid).set({
            'email': email,
            'name': name,
            'birth': birth,
            'gender': gender,
            'username': username,
            'avatar': avatar_url,
            'role': 'user'
        })

        # Đặt session và chuyển hướng
        session['uid'] = uid
        return redirect('/chat')

    except Exception as e:
        return jsonify({'error': str(e)})


@app.route('/login', methods=['POST'])
def login():
    email = request.form['email']
    password = request.form['password']
    try:
        # Đăng nhập với Firebase Auth
        user = auth.sign_in_with_email_and_password(email, password)
        uid = user['localId']
        session['uid'] = uid

        # Lấy thông tin user từ Realtime Database
        user_snapshot = db.child("users").child(uid).get()
        user_data = user_snapshot.val() or {}
        role = user_data.get('role', 'user')

        # Điều hướng theo role
        if role == 'admin':
            return redirect('/admin')      # Admin dashboard
        else:
            return redirect('/chat')       # Trang chat bình thường

    except Exception as e:
        flash('Đăng nhập thất bại. Vui lòng kiểm tra lại thông tin!')
        return redirect('/')


from flask import render_template, redirect, session, flash


@app.route('/admin')
def admin_dashboard():
    # Kiểm tra đã login chưa
    uid = session.get('uid')
    if not uid:
        flash('Vui lòng đăng nhập để truy cập trang này.')
        return redirect('/')

    # Lấy thông tin user từ RTDB
    try:
        user_snapshot = db.child("users").child(uid).get()
        user_data = user_snapshot.val() or {}
    except Exception as e:
        flash('Lỗi hệ thống, vui lòng thử lại sau.')
        return redirect('/')

    # Kiểm tra role
    if user_data.get('role') != 'admin':
        flash('Bạn không có quyền truy cập trang này.')
        return redirect('/')

    # Nếu là admin thì render dashboard
    return render_template('admin.html')


@app.route('/forgotpass')
def forgot_pass():
    return render_template('forgotpass.html')

@app.route('/resetpass', methods=['POST'])
def reset_pass():
    email = request.form['email']
    auth.send_password_reset_email(email)
    return redirect('/')

@app.route('/logout')
def logout():
    session.clear()
    return redirect('/')

@app.route('/chat')
def chat():
    # Nếu chưa có uid trong session thì yêu cầu đăng nhập
    if 'uid' not in session:
        flash('Vui lòng đăng nhập để truy cập trang Chat!')
        return redirect('/')
    # Đã đăng nhập, lấy thông tin và render chat
    user_info = firestore_db.collection('users').document(session['uid']).get().to_dict()
    return render_template('chat.html', user=user_info, uid=session['uid'])

@app.route('/profile')
def profile():
    # Nếu chưa có uid trong session thì yêu cầu đăng nhập
    if 'uid' not in session:
        flash('Vui lòng đăng nhập để xem trang Profile!')
        return redirect('/')
    # Đã đăng nhập, lấy thông tin và render profile
    user_info = firestore_db.collection('users').document(session['uid']).get().to_dict()
    return render_template('profile.html', user=user_info)

@app.route('/update_profile', methods=['POST'])
def update_profile():
    if 'uid' not in session:
        return redirect('/')
    uid = session['uid']
    name = request.form['name']
    birth = request.form['birth']
    gender = request.form['gender']
    avatar = request.files.get('avatar')

    update_data = {'name': name, 'birth': birth, 'gender': gender}
    try:
        if avatar:
            upload_result = cloudinary.uploader.upload(avatar, folder='avatars')
            update_data['avatar'] = upload_result['secure_url']

        user_doc = firestore_db.collection('users').document(uid).get()
        user_data = user_doc.to_dict()
        update_data['email'] = user_data['email']
        update_data['username'] = user_data.get('username') or user_data['email'].split('@')[0]

        firestore_db.collection('users').document(uid).update(update_data)
        db.child("users").child(uid).update({
            'name': update_data['name'],
            'email': update_data['email'],
            'avatar': update_data.get('avatar', user_data.get('avatar', ''))
        })

        return redirect('/chat')
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/search_user', methods=['POST'])
def search_user():
    if 'uid' not in session:
        return jsonify({'error': 'Chưa đăng nhập'}), 401

    data = request.get_json()
    email = data.get('email', '').strip().lower()
    if not email:
        return jsonify({'error': 'Email không hợp lệ'}), 400

    try:
        users_snap = db.child("users").get()
        if not users_snap.each():
            return jsonify({'error': 'Không có người dùng nào'}), 404

        for u in users_snap.each():
            user_data = u.val()
            if user_data.get('email', '').lower() == email:
                return jsonify({
                    'uid': u.key(),
                    'name': user_data.get('name'),
                    'email': user_data.get('email'),
                    'avatar': user_data.get('avatar')
                })

        return jsonify({'error': 'Không tìm thấy người dùng'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/send_message', methods=['POST'])
def send_message():
    if 'uid' not in session:
        return jsonify({'error': 'Chưa đăng nhập'}), 401

    data = request.get_json()
    to_id = data.get('to')
    message = data.get('message')

    if not to_id or not message:
        return jsonify({'error': 'Thiếu thông tin'}), 400

    me = session['uid']
    chat_id = '_'.join(sorted([me, to_id]))
    timestamp = str(int(firebase_admin.firestore.SERVER_TIMESTAMP.seconds))  # fallback

    try:
        db.child("chats").child(chat_id).push({
            'from': me,
            'to': to_id,
            'message': message,
            'time': timestamp
        })
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.context_processor
def inject_user():
    if 'uid' in session:
        try:
            return {'user': firestore_db.collection('users').document(session['uid']).get().to_dict()}
        except:
            return {}
    return {}

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)

