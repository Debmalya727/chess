class UserModel {
  final String id;
  final String username;
  final String? email;
  final int rating;
  final String role;
  final String? createdAt;

  const UserModel({
    required this.id,
    required this.username,
    this.email,
    this.rating = 1500,
    this.role = 'PLAYER',
    this.createdAt,
  });

  factory UserModel.fromJson(Map<String, dynamic> json) {
    return UserModel(
      id: json['id'] as String? ?? '',
      username: json['username'] as String? ?? 'Player',
      email: json['email'] as String?,
      rating: (json['rating'] as num?)?.toInt() ?? 1500,
      role: json['role'] as String? ?? 'PLAYER',
      createdAt: json['createdAt'] as String?,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'username': username,
      if (email != null) 'email': email,
      'rating': rating,
      'role': role,
      if (createdAt != null) 'createdAt': createdAt,
    };
  }

  UserModel copyWith({
    String? id,
    String? username,
    String? email,
    int? rating,
    String? role,
    String? createdAt,
  }) {
    return UserModel(
      id: id ?? this.id,
      username: username ?? this.username,
      email: email ?? this.email,
      rating: rating ?? this.rating,
      role: role ?? this.role,
      createdAt: createdAt ?? this.createdAt,
    );
  }
}
